import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Download, 
  Upload, 
  FileJson, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Database,
  Users,
  Tag,
  Activity,
  Layers,
  Package,
  FileText,
  Link2,
  FileSpreadsheet
} from "lucide-react";
import * as XLSX from "xlsx";
import { Lead } from "@/types/lead";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveOrganization } from "@/hooks/useActiveOrganization";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useTags } from "@/hooks/useTags";

interface ExportImportFunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  onRefetch: () => void;
}

interface ExportData {
  version: string;
  exportedAt: string;
  organization: {
    id: string;
    name: string;
  };
  pipelineStages: Array<{
    id: string;
    name: string;
    color: string;
    position: number;
  }>;
  tags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  leads: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    value: number | null;
    status: string;
    source: string | null;
    assigned_to: string | null;
    notes: string | null;
    stage_name: string | null;
    return_date: string | null;
    source_instance_name: string | null;
    created_at: string;
    last_contact: string | null;
    tags: string[];
    activities: Array<{
      type: string;
      content: string;
      user_name: string | null;
      direction: string | null;
      created_at: string;
    }>;
    products: Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      discount: number | null;
      total_price: number;
      notes: string | null;
    }>;
  }>;
  products: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    category: string | null;
    sku: string | null;
    is_active: boolean;
  }>;
  summary: {
    totalLeads: number;
    totalTags: number;
    totalStages: number;
    totalProducts: number;
    totalActivities: number;
    totalLeadTags: number;
    totalLeadProducts: number;
  };
}

interface ImportResult {
  success: boolean;
  imported: {
    stages: number;
    tags: number;
    leads: number;
    activities: number;
    products: number;
  };
  skipped: {
    leads: number;
    reason: string;
  };
  errors: string[];
}

const BATCH_SIZE = 50;

export function ExportImportFunnelDialog({
  open,
  onOpenChange,
  leads,
  onRefetch,
}: ExportImportFunnelDialogProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [exportFormat, setExportFormat] = useState<"json" | "xlsx">("json");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importData, setImportData] = useState<ExportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<ExportData["summary"] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeOrgId } = useActiveOrganization();
  const { stages } = usePipelineStages();
  const { tags } = useTags();

  const handleExport = async () => {
    if (!activeOrgId) {
      toast({
        title: "Erro",
        description: "Organização não identificada",
        variant: "destructive",
      });
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setExportStatus("Iniciando exportação...");
    setExportSummary(null);

    try {
      // 1. Buscar nome da organização
      setExportStatus("Buscando informações da organização...");
      setExportProgress(5);
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', activeOrgId)
        .single();

      // 2. Buscar todos os produtos da organização
      setExportStatus("Exportando produtos...");
      setExportProgress(10);
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', activeOrgId);

      // 3. Get lead IDs from the passed leads
      const leadIds = leads.map(l => l.id);
      const totalLeads = leadIds.length;
      
      // 4. Fetch activities in batches
      setExportStatus("Exportando atividades...");
      let allActivities: any[] = [];
      if (leadIds.length > 0) {
        const activityBatches = Math.ceil(leadIds.length / BATCH_SIZE);
        for (let batch = 0; batch < activityBatches; batch++) {
          const batchIds = leadIds.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
          setExportStatus(`Exportando atividades... (lote ${batch + 1}/${activityBatches})`);
          setExportProgress(15 + ((batch + 1) / activityBatches) * 25);
          
          const { data: batchActivities } = await supabase
            .from('activities')
            .select('*')
            .in('lead_id', batchIds);
          
          if (batchActivities) allActivities = [...allActivities, ...batchActivities];
        }
      }

      // 5. Fetch lead products in batches
      setExportStatus("Exportando produtos vinculados...");
      let allLeadProducts: any[] = [];
      if (leadIds.length > 0) {
        const productBatches = Math.ceil(leadIds.length / BATCH_SIZE);
        for (let batch = 0; batch < productBatches; batch++) {
          const batchIds = leadIds.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
          setExportStatus(`Exportando produtos de leads... (lote ${batch + 1}/${productBatches})`);
          setExportProgress(40 + ((batch + 1) / productBatches) * 20);
          
          const { data: batchProducts } = await supabase
            .from('lead_products')
            .select('*, products(name)')
            .in('lead_id', batchIds);
          
          if (batchProducts) allLeadProducts = [...allLeadProducts, ...batchProducts];
        }
      }

      // 6. Fetch lead tags in batches
      setExportStatus("Exportando tags de leads...");
      let allLeadTags: any[] = [];
      if (leadIds.length > 0) {
        const tagBatches = Math.ceil(leadIds.length / BATCH_SIZE);
        for (let batch = 0; batch < tagBatches; batch++) {
          const batchIds = leadIds.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
          setExportStatus(`Exportando tags de leads... (lote ${batch + 1}/${tagBatches})`);
          setExportProgress(60 + ((batch + 1) / tagBatches) * 20);
          
          const { data: batchTags } = await supabase
            .from('lead_tags')
            .select('lead_id, tags(name)')
            .in('lead_id', batchIds);
          
          if (batchTags) allLeadTags = [...allLeadTags, ...batchTags];
        }
      }

      setExportStatus("Processando dados...");
      setExportProgress(85);

      // Criar mapa de stage_id para nome
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Criar mapa de atividades por lead
      const activitiesByLead = allActivities.reduce((acc, act) => {
        if (!acc[act.lead_id]) acc[act.lead_id] = [];
        acc[act.lead_id].push({
          type: act.type,
          content: act.content,
          user_name: act.user_name,
          direction: act.direction,
          created_at: act.created_at,
        });
        return acc;
      }, {} as Record<string, any[]>);

      // Criar mapa de produtos por lead
      const productsByLead = allLeadProducts.reduce((acc, lp) => {
        if (!acc[lp.lead_id]) acc[lp.lead_id] = [];
        acc[lp.lead_id].push({
          product_name: lp.products?.name || 'Produto desconhecido',
          quantity: lp.quantity || 1,
          unit_price: lp.unit_price,
          discount: lp.discount,
          total_price: lp.total_price,
          notes: lp.notes,
        });
        return acc;
      }, {} as Record<string, any[]>);

      // Criar mapa de tags por lead
      const tagsByLead = allLeadTags.reduce((acc, lt: any) => {
        if (!acc[lt.lead_id]) acc[lt.lead_id] = [];
        if (lt.tags?.name) acc[lt.lead_id].push(lt.tags.name);
        return acc;
      }, {} as Record<string, string[]>);

      const summary = {
        totalLeads: leads.length,
        totalTags: tags.length,
        totalStages: stages.length,
        totalProducts: (productsData || []).length,
        totalActivities: allActivities.length,
        totalLeadTags: allLeadTags.length,
        totalLeadProducts: allLeadProducts.length,
      };

      setExportSummary(summary);

      // Montar dados de exportação
      const exportData: ExportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        organization: {
          id: activeOrgId,
          name: orgData?.name || 'Organização',
        },
        pipelineStages: stages.map(s => ({
          id: s.id,
          name: s.name,
          color: s.color,
          position: s.position,
        })),
        tags: tags.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color,
        })),
        leads: leads.map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          company: lead.company || null,
          value: lead.value || null,
          status: lead.status,
          source: lead.source || null,
          assigned_to: lead.assignedTo || null,
          notes: lead.notes || null,
          stage_name: lead.stageId ? stageMap.get(lead.stageId) || null : null,
          return_date: lead.returnDate ? lead.returnDate.toISOString() : null,
          source_instance_name: lead.sourceInstanceName || null,
          created_at: lead.createdAt.toISOString(),
          last_contact: lead.lastContact ? lead.lastContact.toISOString() : null,
          tags: tagsByLead[lead.id] || [],
          activities: activitiesByLead[lead.id] || [],
          products: productsByLead[lead.id] || [],
        })),
        products: (productsData || []).map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          sku: p.sku,
          is_active: p.is_active,
        })),
        summary,
      };

      // Criar e baixar arquivo
      setExportStatus("Gerando arquivo...");
      setExportProgress(95);
      
      const timestamp = formatDate(new Date(), "yyyy-MM-dd-HHmm", { locale: ptBR });
      
      if (exportFormat === "xlsx") {
        // Criar workbook com múltiplas abas
        const workbook = XLSX.utils.book_new();
        
        // Aba 1: Leads
        const leadsData = exportData.leads.map(lead => ({
          Nome: lead.name,
          Telefone: lead.phone,
          Email: lead.email || "",
          Empresa: lead.company || "",
          Valor: lead.value || 0,
          Status: lead.status,
          Origem: lead.source || "",
          Responsável: lead.assigned_to || "",
          Notas: lead.notes || "",
          "Etapa do Funil": lead.stage_name || "",
          "Data de Retorno": lead.return_date || "",
          "Instância WhatsApp": lead.source_instance_name || "",
          "Data de Criação": lead.created_at,
          "Último Contato": lead.last_contact || "",
          Tags: lead.tags.join(", "),
          "Qtd. Atividades": lead.activities.length,
          "Qtd. Produtos": lead.products.length,
        }));
        const leadsSheet = XLSX.utils.json_to_sheet(leadsData);
        XLSX.utils.book_append_sheet(workbook, leadsSheet, "Leads");
        
        // Aba 2: Atividades
        const activitiesData = exportData.leads.flatMap(lead => 
          lead.activities.map(act => ({
            "Lead": lead.name,
            "Telefone Lead": lead.phone,
            "Tipo": act.type,
            "Conteúdo": act.content,
            "Usuário": act.user_name || "",
            "Direção": act.direction || "",
            "Data": act.created_at,
          }))
        );
        if (activitiesData.length > 0) {
          const activitiesSheet = XLSX.utils.json_to_sheet(activitiesData);
          XLSX.utils.book_append_sheet(workbook, activitiesSheet, "Atividades");
        }
        
        // Aba 3: Produtos de Leads
        const leadProductsData = exportData.leads.flatMap(lead => 
          lead.products.map(prod => ({
            "Lead": lead.name,
            "Telefone Lead": lead.phone,
            "Produto": prod.product_name,
            "Quantidade": prod.quantity,
            "Preço Unitário": prod.unit_price,
            "Desconto": prod.discount || 0,
            "Preço Total": prod.total_price,
            "Notas": prod.notes || "",
          }))
        );
        if (leadProductsData.length > 0) {
          const leadProductsSheet = XLSX.utils.json_to_sheet(leadProductsData);
          XLSX.utils.book_append_sheet(workbook, leadProductsSheet, "Produtos de Leads");
        }
        
        // Aba 4: Etapas do Funil
        const stagesData = exportData.pipelineStages.map(stage => ({
          Nome: stage.name,
          Cor: stage.color,
          Posição: stage.position,
        }));
        const stagesSheet = XLSX.utils.json_to_sheet(stagesData);
        XLSX.utils.book_append_sheet(workbook, stagesSheet, "Etapas");
        
        // Aba 5: Tags
        const tagsData = exportData.tags.map(tag => ({
          Nome: tag.name,
          Cor: tag.color,
        }));
        const tagsSheet = XLSX.utils.json_to_sheet(tagsData);
        XLSX.utils.book_append_sheet(workbook, tagsSheet, "Tags");
        
        // Aba 6: Produtos
        const productsData = exportData.products.map(prod => ({
          Nome: prod.name,
          Descrição: prod.description || "",
          Preço: prod.price,
          Categoria: prod.category || "",
          SKU: prod.sku || "",
          Ativo: prod.is_active ? "Sim" : "Não",
        }));
        if (productsData.length > 0) {
          const productsSheet = XLSX.utils.json_to_sheet(productsData);
          XLSX.utils.book_append_sheet(workbook, productsSheet, "Produtos");
        }
        
        // Gerar e baixar arquivo
        XLSX.writeFile(workbook, `funil-completo-${timestamp}.xlsx`);
      } else {
        // JSON export
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `funil-completo-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setExportProgress(100);
      setExportStatus("Exportação concluída!");

      toast({
        title: "Exportação concluída",
        description: `${leads.length} leads exportados em ${exportFormat.toUpperCase()}`,
      });
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      toast({
        title: "Erro na exportação",
        description: error.message,
        variant: "destructive",
      });
      setExportStatus("Erro na exportação");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    setImportData(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        
        // Validar estrutura básica
        if (!data.version || !data.leads || !Array.isArray(data.leads)) {
          throw new Error("Arquivo inválido: estrutura não reconhecida");
        }

        setImportData(data);
      } catch (error: any) {
        setImportError(error.message || "Erro ao ler arquivo");
      }
    };
    reader.onerror = () => {
      setImportError("Erro ao ler o arquivo");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData || !activeOrgId) return;

    setImporting(true);
    setImportProgress(0);

    const result: ImportResult = {
      success: false,
      imported: { stages: 0, tags: 0, leads: 0, activities: 0, products: 0 },
      skipped: { leads: 0, reason: "" },
      errors: [],
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const totalSteps = 5;
      let currentStep = 0;

      // 1. Importar etapas do pipeline (se não existirem)
      currentStep++;
      setImportProgress((currentStep / totalSteps) * 100);
      
      const existingStageNames = new Set(stages.map(s => s.name.toLowerCase()));
      const stageNameToId = new Map(stages.map(s => [s.name.toLowerCase(), s.id]));
      
      for (const stage of importData.pipelineStages) {
        if (!existingStageNames.has(stage.name.toLowerCase())) {
          const { data: newStage, error } = await supabase
            .from('pipeline_stages')
            .insert({
              user_id: user.id,
              organization_id: activeOrgId,
              name: stage.name,
              color: stage.color,
              position: stage.position,
            })
            .select()
            .single();

          if (!error && newStage) {
            stageNameToId.set(stage.name.toLowerCase(), newStage.id);
            result.imported.stages++;
          }
        }
      }

      // 2. Importar tags (se não existirem)
      currentStep++;
      setImportProgress((currentStep / totalSteps) * 100);
      
      const existingTagNames = new Set(tags.map(t => t.name.toLowerCase()));
      const tagNameToId = new Map(tags.map(t => [t.name.toLowerCase(), t.id]));
      
      for (const tag of importData.tags) {
        if (!existingTagNames.has(tag.name.toLowerCase())) {
          const { data: newTag, error } = await supabase
            .from('tags')
            .insert({
              user_id: user.id,
              organization_id: activeOrgId,
              name: tag.name,
              color: tag.color,
            })
            .select()
            .single();

          if (!error && newTag) {
            tagNameToId.set(tag.name.toLowerCase(), newTag.id);
            result.imported.tags++;
          }
        }
      }

      // 3. Importar produtos (se não existirem)
      currentStep++;
      setImportProgress((currentStep / totalSteps) * 100);
      
      const { data: existingProducts } = await supabase
        .from('products')
        .select('name')
        .eq('organization_id', activeOrgId);
      
      const existingProductNames = new Set((existingProducts || []).map(p => p.name.toLowerCase()));
      const productNameToId = new Map<string, string>();
      
      for (const product of importData.products || []) {
        if (!existingProductNames.has(product.name.toLowerCase())) {
          const { data: newProduct, error } = await supabase
            .from('products')
            .insert({
              organization_id: activeOrgId,
              name: product.name,
              description: product.description,
              price: product.price,
              category: product.category,
              sku: product.sku,
              is_active: product.is_active,
            })
            .select()
            .single();

          if (!error && newProduct) {
            productNameToId.set(product.name.toLowerCase(), newProduct.id);
            result.imported.products++;
          }
        }
      }

      // 4. Importar leads
      currentStep++;
      setImportProgress((currentStep / totalSteps) * 100);
      
      // Verificar leads existentes por telefone
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone')
        .eq('organization_id', activeOrgId)
        .is('deleted_at', null);
      
      const existingPhones = new Set((existingLeads || []).map(l => l.phone.replace(/\D/g, '')));
      
      // Obter primeira etapa como fallback
      const firstStage = stages.sort((a, b) => a.position - b.position)[0];
      
      for (const lead of importData.leads) {
        const normalizedPhone = lead.phone.replace(/\D/g, '');
        
        if (existingPhones.has(normalizedPhone)) {
          result.skipped.leads++;
          continue;
        }

        // Encontrar stage_id pelo nome
        let stageId = lead.stage_name 
          ? stageNameToId.get(lead.stage_name.toLowerCase()) 
          : firstStage?.id;
        
        if (!stageId) stageId = firstStage?.id;

        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            user_id: user.id,
            organization_id: activeOrgId,
            name: lead.name,
            phone: normalizedPhone,
            email: lead.email,
            company: lead.company,
            value: lead.value,
            status: lead.status || 'new',
            source: lead.source || 'import',
            assigned_to: lead.assigned_to,
            notes: lead.notes,
            stage_id: stageId,
            return_date: lead.return_date,
            created_at: lead.created_at,
            last_contact: lead.last_contact,
          })
          .select()
          .single();

        if (leadError) {
          result.errors.push(`Lead ${lead.name}: ${leadError.message}`);
          continue;
        }

        result.imported.leads++;
        existingPhones.add(normalizedPhone);

        // Adicionar tags ao lead
        for (const tagName of lead.tags) {
          const tagId = tagNameToId.get(tagName.toLowerCase());
          if (tagId && newLead) {
            await supabase
              .from('lead_tags')
              .insert({ lead_id: newLead.id, tag_id: tagId });
          }
        }

        // Adicionar atividades
        for (const activity of lead.activities) {
          if (newLead) {
            const { error: actError } = await supabase
              .from('activities')
              .insert({
                lead_id: newLead.id,
                organization_id: activeOrgId,
                type: activity.type,
                content: activity.content,
                user_name: activity.user_name || 'Import',
                direction: activity.direction,
                created_at: activity.created_at,
              });
            
            if (!actError) result.imported.activities++;
          }
        }
      }

      // 5. Finalizar
      currentStep++;
      setImportProgress(100);
      
      if (result.skipped.leads > 0) {
        result.skipped.reason = "Telefone já existe na organização";
      }

      result.success = true;
      setImportResult(result);

      toast({
        title: "Importação concluída",
        description: `${result.imported.leads} leads importados`,
      });

      onRefetch();
    } catch (error: any) {
      console.error('Erro na importação:', error);
      result.errors.push(error.message);
      setImportResult(result);
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportData(null);
    setImportError(null);
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Exportar / Importar Funil Completo
          </DialogTitle>
          <DialogDescription>
            Exporte todos os dados do funil ou importe de outro ambiente
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "export" | "import")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Dados que serão exportados:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>{leads.length} leads</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span>{stages.length} etapas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <span>{tags.length} etiquetas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>Atividades de cada lead</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span>Produtos vinculados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span>Associações lead-tag</span>
                </div>
              </div>
            </div>

            {/* Seletor de formato */}
            <div className="border rounded-lg p-4 space-y-3">
              <Label className="font-medium">Formato de exportação</Label>
              <RadioGroup
                value={exportFormat}
                onValueChange={(v) => setExportFormat(v as "json" | "xlsx")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="format-json" />
                  <Label htmlFor="format-json" className="flex items-center gap-2 cursor-pointer">
                    <FileJson className="h-4 w-4" />
                    JSON (para reimportação)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="xlsx" id="format-xlsx" />
                  <Label htmlFor="format-xlsx" className="flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel (XLSX)
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {exportFormat === "json" 
                  ? "JSON permite reimportar os dados em outro ambiente com 100% de fidelidade."
                  : "XLSX é ideal para visualização e análise em planilhas. Inclui várias abas com todos os dados."}
              </p>
            </div>

            {/* Lista detalhada dos campos exportados */}
            <div className="border rounded-lg">
              <div className="p-3 border-b bg-muted/30">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Descrição completa dos dados exportados
                </h4>
              </div>
              <ScrollArea className="h-48">
                <div className="p-3 space-y-4 text-sm">
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Layers className="h-3.5 w-3.5" /> Etapas do Funil (pipeline_stages)
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Nome da etapa</li>
                      <li>Cor da etapa</li>
                      <li>Posição/ordem</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Tag className="h-3.5 w-3.5" /> Tags/Etiquetas
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Nome da tag</li>
                      <li>Cor da tag</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Package className="h-3.5 w-3.5" /> Produtos
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Nome do produto</li>
                      <li>Descrição</li>
                      <li>Preço</li>
                      <li>Categoria</li>
                      <li>SKU</li>
                      <li>Status (ativo/inativo)</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Users className="h-3.5 w-3.5" /> Leads
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Nome</li>
                      <li>Telefone</li>
                      <li>E-mail</li>
                      <li>Empresa</li>
                      <li>Valor</li>
                      <li>Status</li>
                      <li>Origem/Source</li>
                      <li>Responsável (assigned_to)</li>
                      <li>Notas/Observações</li>
                      <li>Etapa do funil (stage_name)</li>
                      <li>Data de retorno</li>
                      <li>Instância de origem (WhatsApp)</li>
                      <li>Data de criação</li>
                      <li>Último contato</li>
                      <li>Tags associadas</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Activity className="h-3.5 w-3.5" /> Atividades (por lead)
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Tipo da atividade (ligação, mensagem, nota, etc)</li>
                      <li>Conteúdo/Descrição</li>
                      <li>Nome do usuário que criou</li>
                      <li>Direção (entrada/saída)</li>
                      <li>Data de criação</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary flex items-center gap-2 mb-1">
                      <Link2 className="h-3.5 w-3.5" /> Produtos do Lead (lead_products)
                    </h5>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5 ml-2">
                      <li>Nome do produto</li>
                      <li>Quantidade</li>
                      <li>Preço unitário</li>
                      <li>Desconto</li>
                      <li>Preço total</li>
                      <li>Notas</li>
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {exporting && (
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{exportStatus}</span>
                </div>
                <Progress value={exportProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {Math.round(exportProgress)}% concluído
                </p>
              </div>
            )}

            {exportSummary && !exporting && (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-green-700 dark:text-green-400">Exportação concluída com sucesso!</p>
                    <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                      <span>Leads: <strong>{exportSummary.totalLeads}</strong></span>
                      <span>Etapas: <strong>{exportSummary.totalStages}</strong></span>
                      <span>Tags: <strong>{exportSummary.totalTags}</strong></span>
                      <span>Produtos: <strong>{exportSummary.totalProducts}</strong></span>
                      <span>Atividades: <strong>{exportSummary.totalActivities}</strong></span>
                      <span>Tags de leads: <strong>{exportSummary.totalLeadTags}</strong></span>
                      <span>Produtos de leads: <strong>{exportSummary.totalLeadProducts}</strong></span>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <FileJson className="h-4 w-4" />
              <AlertDescription>
                A exportação é processada em lotes de {BATCH_SIZE} registros para evitar timeout.
                O arquivo JSON exportado contém todos os dados necessários para recriar 
                o funil em outro ambiente com 100% de fidelidade.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar {exportFormat.toUpperCase()}
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            {!importData && !importResult && (
              <>
                <div 
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Clique ou arraste um arquivo JSON para importar
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {importError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {importData && !importResult && (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Arquivo válido carregado: <strong>{importData.organization.name}</strong>
                  </AlertDescription>
                </Alert>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Dados a serem importados:</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span>{importData.summary.totalLeads} leads</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span>{importData.summary.totalStages} etapas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <span>{importData.summary.totalTags} etiquetas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <span>{importData.summary.totalActivities} atividades</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Exportado em: {formatDate(new Date(importData.exportedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                {importing && (
                  <div className="space-y-2">
                    <Label>Progresso da importação</Label>
                    <Progress value={importProgress} />
                    <p className="text-xs text-muted-foreground text-center">
                      {Math.round(importProgress)}%
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={resetImport} disabled={importing}>
                    Cancelar
                  </Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Iniciar Importação
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {importResult && (
              <div className="space-y-4">
                <Alert variant={importResult.success ? "default" : "destructive"}>
                  {importResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    {importResult.success ? "Importação concluída!" : "Importação com erros"}
                  </AlertDescription>
                </Alert>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Resumo:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span>Leads importados:</span>
                    <span className="font-medium text-green-600">{importResult.imported.leads}</span>
                    
                    <span>Etapas criadas:</span>
                    <span className="font-medium">{importResult.imported.stages}</span>
                    
                    <span>Etiquetas criadas:</span>
                    <span className="font-medium">{importResult.imported.tags}</span>
                    
                    <span>Atividades importadas:</span>
                    <span className="font-medium">{importResult.imported.activities}</span>
                    
                    {importResult.skipped.leads > 0 && (
                      <>
                        <span>Leads ignorados:</span>
                        <span className="font-medium text-yellow-600">
                          {importResult.skipped.leads} ({importResult.skipped.reason})
                        </span>
                      </>
                    )}
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-destructive">Erros:</p>
                      <ul className="text-xs text-destructive list-disc list-inside">
                        {importResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li>...e mais {importResult.errors.length - 5} erros</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button onClick={() => { resetImport(); onOpenChange(false); }}>
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
