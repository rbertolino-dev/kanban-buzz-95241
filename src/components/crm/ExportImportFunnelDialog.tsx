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
  Layers
} from "lucide-react";
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

export function ExportImportFunnelDialog({
  open,
  onOpenChange,
  leads,
  onRefetch,
}: ExportImportFunnelDialogProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importData, setImportData] = useState<ExportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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

    try {
      // Buscar nome da organização
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', activeOrgId)
        .single();

      // Buscar todas as atividades dos leads
      const leadIds = leads.map(l => l.id);
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('*')
        .in('lead_id', leadIds);

      // Buscar todos os produtos da organização
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', activeOrgId);

      // Buscar produtos vinculados aos leads
      const { data: leadProductsData } = await supabase
        .from('lead_products')
        .select('*, products(name)')
        .in('lead_id', leadIds);

      // Buscar tags dos leads
      const { data: leadTagsData } = await supabase
        .from('lead_tags')
        .select('lead_id, tags(name)')
        .in('lead_id', leadIds);

      // Criar mapa de stage_id para nome
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Criar mapa de atividades por lead
      const activitiesByLead = (activitiesData || []).reduce((acc, act) => {
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
      const productsByLead = (leadProductsData || []).reduce((acc, lp) => {
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
      const tagsByLead = (leadTagsData || []).reduce((acc, lt: any) => {
        if (!acc[lt.lead_id]) acc[lt.lead_id] = [];
        if (lt.tags?.name) acc[lt.lead_id].push(lt.tags.name);
        return acc;
      }, {} as Record<string, string[]>);

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
        summary: {
          totalLeads: leads.length,
          totalTags: tags.length,
          totalStages: stages.length,
          totalProducts: (productsData || []).length,
          totalActivities: (activitiesData || []).length,
        },
      };

      // Criar e baixar arquivo
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `funil-completo-${formatDate(new Date(), "yyyy-MM-dd-HHmm", { locale: ptBR })}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `${leads.length} leads exportados com sucesso`,
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      toast({
        title: "Erro na exportação",
        description: error.message,
        variant: "destructive",
      });
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
                  <span>Todas as atividades</span>
                </div>
              </div>
            </div>

            <Alert>
              <FileJson className="h-4 w-4" />
              <AlertDescription>
                O arquivo JSON exportado contém todos os dados necessários para recriar 
                o funil em outro ambiente, incluindo leads, etapas, etiquetas, atividades 
                e produtos vinculados.
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
                    Exportar JSON
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
