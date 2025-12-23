import { useState, useRef, useMemo, useEffect } from "react";
import { Lead, LeadStatus, CallQueueItem } from "@/types/lead";
import { LeadCard } from "./LeadCard";
import { LeadDetailModal } from "./LeadDetailModal";
import { KanbanColumn } from "./KanbanColumn";
import { BulkImportPanel } from "./BulkImportPanel";
import { KanbanSettings } from "./KanbanSettings";
import { SalesReportDialog } from "./SalesReportDialog";
import { ExportImportFunnelDialog } from "./ExportImportFunnelDialog";
import { FollowUpTemplateManager } from "./FollowUpTemplateManager";
import { DndContext, DragEndEvent, DragOverlay, closestCorners, DragOverEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useEvolutionConfigs } from "@/hooks/useEvolutionConfigs";
import { useKanbanSettings } from "@/hooks/useKanbanSettings";
import { Loader2, Upload, ChevronLeft, ChevronRight, ArrowRight, Phone, Trash2, X, ArrowDownUp, Maximize2, Minimize2, BarChart3, Send, List, Tag, Database } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkflowLists } from "@/hooks/useWorkflowLists";
import { normalizePhone } from "@/lib/phoneUtils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { getUserOrganizationId, ensureUserOrganization } from "@/lib/organizationUtils";
import { useViewPreference } from "@/hooks/useViewPreference";
import { useTags } from "@/hooks/useTags";

interface KanbanBoardProps {
  leads: Lead[];
  onLeadUpdate: (leadId: string, newStatus: string) => void;
  searchQuery?: string;
  onRefetch: () => void;
  onEditLeadName?: (leadId: string, newName: string) => Promise<void>;
  filterInstance?: string;
  filterCreatedDateStart?: string;
  filterCreatedDateEnd?: string;
  filterReturnDateStart?: string;
  filterReturnDateEnd?: string;
  filterInCallQueue?: boolean;
  filterTags?: string[];
  callQueue?: CallQueueItem[];
}

export function KanbanBoard({ leads, onLeadUpdate, searchQuery = "", onRefetch, onEditLeadName, filterInstance = "all", filterCreatedDateStart = "", filterCreatedDateEnd = "", filterReturnDateStart = "", filterReturnDateEnd = "", filterInCallQueue = false, filterTags = [], callQueue = [] }: KanbanBoardProps) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [leadsInCallQueue, setLeadsInCallQueue] = useState<Set<string>>(new Set());
  const [reportsOpen, setReportsOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const { stages, loading: stagesLoading } = usePipelineStages();
  const { configs } = useEvolutionConfigs();
  const { columnWidth, updateColumnWidth } = useKanbanSettings();
  const { cardSize, toggleCardSize } = useViewPreference();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { lists, saveList, refetch: refetchLists } = useWorkflowLists();
  const [addToListDialogOpen, setAddToListDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [isAddingToList, setIsAddingToList] = useState(false);
  const { tags, addTagToLead } = useTags();
  const [addTagDialogOpen, setAddTagDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  
  // Criar mapa de instâncias para lookup rápido
  const instanceMap = useMemo(() => {
    const map = new Map<string, string>();
    configs?.forEach(config => {
      map.set(config.id, config.instance_name);
    });
    return map;
  }, [configs]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Buscar leads que estão na fila de ligação
  useEffect(() => {
    const fetchCallQueueLeads = async () => {
      const { data } = await supabase
        .from('call_queue')
        .select('lead_id')
        .eq('status', 'pending');
      
      if (data) {
        setLeadsInCallQueue(new Set(data.map(item => item.lead_id)));
      }
    };

    fetchCallQueueLeads();

    // ✅ OTIMIZAÇÃO: Manter apenas realtime da call_queue (useLeads já gerencia leads)
    const channel = supabase
      .channel('call-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_queue'
        },
        () => fetchCallQueueLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredLeads = leads.filter(lead => {
    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const normalizedQuery = normalizePhone(searchQuery);
      const normalizedLeadPhone = normalizePhone(lead.phone);
      
      const matchesName = lead.name.toLowerCase().includes(query);
      const matchesPhone = normalizedLeadPhone.includes(normalizedQuery);
      const matchesTags = lead.tags?.some(tag => tag.name.toLowerCase().includes(query));
      
      if (!matchesName && !matchesPhone && !matchesTags) return false;
    }

    // Filtro de instância
    if (filterInstance && filterInstance !== "all") {
      if (lead.sourceInstanceId !== filterInstance) return false;
    }

    // Filtro de data de criação
    if (filterCreatedDateStart) {
      const startDate = new Date(filterCreatedDateStart);
      startDate.setHours(0, 0, 0, 0);
      if (new Date(lead.createdAt) < startDate) return false;
    }
    if (filterCreatedDateEnd) {
      const endDate = new Date(filterCreatedDateEnd);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(lead.createdAt) > endDate) return false;
    }

    // Filtro de data de retorno
    if (filterReturnDateStart && lead.returnDate) {
      const startDate = new Date(filterReturnDateStart);
      startDate.setHours(0, 0, 0, 0);
      if (new Date(lead.returnDate) < startDate) return false;
    }
    if (filterReturnDateEnd && lead.returnDate) {
      const endDate = new Date(filterReturnDateEnd);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(lead.returnDate) > endDate) return false;
    }

    // Filtro de fila de ligação
    if (filterInCallQueue) {
      if (!leadsInCallQueue.has(lead.id)) return false;
    }

    // Filtro de etiquetas
    if (filterTags.length > 0) {
      const leadTagIds = lead.tags?.map(tag => tag.id) || [];
      const hasAnyTag = filterTags.some(tagId => leadTagIds.includes(tagId));
      if (!hasAnyTag) return false;
    }

    return true;
  });

  // Map de etapas válidas (apenas da organização atual)
  const stageIdSet = useMemo(() => new Set(stages.map(s => s.id)), [stages]);
  
  // Primeira etapa ordenada por posição (não alfabética)
  const firstStageId = useMemo(() => {
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    return sorted[0]?.id;
  }, [stages]);

  // Normaliza leads: se a etapa estiver ausente ou inválida, usa a primeira etapa DA ORG
  const normalizedLeads = useMemo(() => {
    return filteredLeads.map(l => {
      if (!l.stageId || !stageIdSet.has(l.stageId)) {
        return { ...l, stageId: firstStageId };
      }
      return l;
    });
  }, [filteredLeads, stageIdSet, firstStageId]);

  // Correção automática no banco APENAS para leads com etapa inválida
  useEffect(() => {
    if (!firstStageId || stages.length === 0) return;
    
    const invalids = filteredLeads.filter(l => !l.stageId || !stageIdSet.has(l.stageId));
    if (invalids.length === 0) return;

    (async () => {
      for (const lead of invalids) {
        try {
          // Validação extra: garantir que estamos usando etapa da mesma org
          const targetStage = stages.find(s => s.id === firstStageId);
          if (!targetStage) continue;
          
          await supabase
            .from('leads')
            .update({ stage_id: firstStageId })
            .eq('id', lead.id);
            
          console.log(`✅ Etapa corrigida para ${lead.name} -> ${targetStage.name}`);
        } catch (e) {
          console.error('Falha ao corrigir etapa do lead', lead.id, e);
        }
      }
      onRefetch();
    })();
  }, [filteredLeads, stageIdSet, firstStageId, stages, onRefetch]);

  if (stagesLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) return;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;
    
    // Check if we're dropping over a stage column
    const targetStage = stages.find(s => s.id === overId);
    if (targetStage) {
      onLeadUpdate(leadId, targetStage.id);
    }
  };

  // Normalização e correção movidas para antes do carregamento.


  const activeLead = activeId ? leads.find((lead) => lead.id === activeId) : null;

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  };

  const toggleAllInStage = (stageId: string, leadIds: string[]) => {
    setSelectedLeadIds(prev => {
      const newSet = new Set(prev);
      const allSelected = leadIds.every(id => newSet.has(id));
      
      if (allSelected) {
        // Desmarcar todos da etapa
        leadIds.forEach(id => newSet.delete(id));
      } else {
        // Marcar todos da etapa
        leadIds.forEach(id => newSet.add(id));
      }
      
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedLeadIds(new Set());
  };

  const handleMoveToNextStage = async () => {
    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    
    for (const lead of selectedLeads) {
      const currentStageIndex = stages.findIndex(s => s.id === lead.stageId);
      if (currentStageIndex < stages.length - 1) {
        const nextStage = stages[currentStageIndex + 1];
        await onLeadUpdate(lead.id, nextStage.id);
      }
    }

    toast({
      title: "Leads movidos",
      description: `${selectedLeads.length} lead(s) movido(s) para a próxima etapa`,
    });

    clearSelection();
  };

  const handleAddToCallQueue = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Sessão expirada",
        description: "Faça login para adicionar à Fila de Ligações.",
        variant: "destructive",
      });
      return;
    }

    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    
    if (selectedLeads.length === 0) {
      toast({
        title: "Selecione ao menos um lead",
        description: "Marque os cards e clique em Fila para adicionar.",
      });
      return;
    }

    try {
      let addedCount = 0;
      let skippedCount = 0;

      for (const lead of selectedLeads) {
        const { data, error } = await supabase.rpc('add_to_call_queue_secure', {
          p_lead_id: lead.id,
          p_scheduled_for: new Date().toISOString(),
          p_priority: 'medium',
          p_notes: null,
        });

        if (error) {
          console.error('Erro ao adicionar lead à fila:', error);
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('já está na fila')) {
            // Lead já está na fila, não contar como erro
            continue;
          }
          skippedCount++;
          if (msg.includes('não pertence à organização')) {
            toast({
              title: `Sem permissão para ${lead.name}`,
              description: 'Você não pertence à organização deste lead.',
              variant: 'destructive',
            });
          } else if (msg.includes('lead não encontrado') || msg.includes('não encontrado')) {
            toast({
              title: `Lead não encontrado: ${lead.name}`,
              description: 'O lead pode ter sido removido.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: `Falha ao adicionar ${lead.name}`,
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          addedCount++;
        }
      }

      if (addedCount > 0) {
        toast({
          title: "Adicionado à fila",
          description: `${addedCount} lead(s) adicionado(s) à fila de ligações${skippedCount > 0 ? ` (${skippedCount} com erro)` : ''}`,
        });
      } else {
        toast({
          title: "Nenhum lead adicionado",
          description: skippedCount > 0 ? `${skippedCount} lead(s) não puderam ser adicionados.` : 'Nada para adicionar.',
          variant: 'destructive',
        });
      }

      clearSelection();
      onRefetch();
    } catch (error: any) {
      toast({
        title: 'Erro ao adicionar à fila',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSelected = async () => {
    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    
    for (const lead of selectedLeads) {
      await supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', lead.id);
    }

    toast({
      title: "Leads excluídos",
      description: `${selectedLeads.length} lead(s) excluído(s)`,
    });

    clearSelection();
    onRefetch();
  };

  const handleAddToDisparoList = async () => {
    if (!selectedListId) {
      toast({
        title: "Lista não selecionada",
        description: "Selecione uma lista para adicionar os leads",
        variant: "destructive",
      });
      return;
    }

    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    if (selectedLeads.length === 0) {
      toast({
        title: "Nenhum lead selecionado",
        description: "Selecione pelo menos um lead",
        variant: "destructive",
      });
      return;
    }

    setIsAddingToList(true);
    try {
      const list = lists.find(l => l.id === selectedListId);
      if (!list) throw new Error("Lista não encontrada");

      // Verificar quais leads já estão na lista
      const existingPhones = new Set(list.contacts.map(c => c.phone));
      const existingLeadIds = new Set(list.contacts.map(c => c.lead_id).filter(Boolean));

      const newContacts = selectedLeads
        .filter(lead => 
          !existingPhones.has(lead.phone) && 
          !existingLeadIds.has(lead.id)
        )
        .map(lead => ({
          lead_id: lead.id,
          phone: lead.phone,
          name: lead.name,
          variables: {},
        }));

      if (newContacts.length === 0) {
        toast({
          title: "Nenhum lead novo",
          description: "Todos os leads selecionados já estão na lista",
        });
        return;
      }

      // Adicionar à lista
      await saveList({
        id: list.id,
        name: list.name,
        description: list.description || undefined,
        default_instance_id: list.default_instance_id || undefined,
        contacts: [...list.contacts, ...newContacts],
      });

      toast({
        title: "Leads adicionados",
        description: `${newContacts.length} lead(s) adicionado(s) à lista "${list.name}"`,
      });

      setAddToListDialogOpen(false);
      setSelectedListId("");
      clearSelection();
      await refetchLists();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar à lista",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingToList(false);
    }
  };

  const handleAddTagToSelected = async () => {
    if (!selectedTagId) {
      toast({
        title: "Etiqueta não selecionada",
        description: "Selecione uma etiqueta para adicionar aos leads",
        variant: "destructive",
      });
      return;
    }

    const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));
    if (selectedLeads.length === 0) {
      toast({
        title: "Nenhum lead selecionado",
        description: "Selecione pelo menos um lead",
        variant: "destructive",
      });
      return;
    }

    setIsAddingTag(true);
    try {
      let addedCount = 0;
      let alreadyExistedCount = 0;
      let errorCount = 0;

      for (const lead of selectedLeads) {
        // Verificar se o lead já tem a etiqueta (verificação local antes de chamar API)
        const hasTag = lead.tags?.some(tag => tag.id === selectedTagId);
        if (hasTag) {
          alreadyExistedCount++;
          continue;
        }

        const result = await addTagToLead(lead.id, selectedTagId);
        if (result.success && !result.alreadyExists) {
          addedCount++;
        } else if (result.success && result.alreadyExists) {
          alreadyExistedCount++;
        } else {
          errorCount++;
        }
      }

      if (addedCount > 0) {
        const extras = [];
        if (alreadyExistedCount > 0) extras.push(`${alreadyExistedCount} já tinham`);
        if (errorCount > 0) extras.push(`${errorCount} erro(s)`);
        
        toast({
          title: "Etiquetas adicionadas",
          description: `${addedCount} lead(s) receberam a etiqueta${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`,
        });
      } else {
        const message = [];
        if (alreadyExistedCount > 0) message.push(`${alreadyExistedCount} já possuíam a etiqueta`);
        if (errorCount > 0) message.push(`${errorCount} erro(s)`);
        
        toast({
          title: "Nenhuma etiqueta adicionada",
          description: message.length > 0 ? message.join(', ') + '.' : 'Nada para adicionar.',
          variant: "default",
        });
      }

      setAddTagDialogOpen(false);
      setSelectedTagId("");
      clearSelection();
      onRefetch();
    } catch (error: any) {
      toast({
        title: 'Erro ao adicionar etiquetas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsAddingTag(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between p-2 sm:p-4 border-b border-border gap-2">
        <div className="flex items-center gap-2">
          <FollowUpTemplateManager />
          
          <KanbanSettings
            columnWidth={columnWidth}
            onColumnWidthChange={updateColumnWidth}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={toggleCardSize}
            className="gap-2"
            title={cardSize === 'compact' ? 'Visualização Normal' : 'Visualização Compacta'}
          >
            {cardSize === 'compact' ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {cardSize === 'compact' ? 'Normal' : 'Compacto'}
            </span>
          </Button>
          
          <Select value={sortOrder} onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}>
            <SelectTrigger className="w-[180px] sm:w-[200px]">
              <ArrowDownUp className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportImportOpen(true)}
            className="gap-2 text-xs sm:text-sm"
          >
            <Database className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Exportar/Importar</span>
            <span className="sm:hidden">Export</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportsOpen(true)}
            className="gap-2 text-xs sm:text-sm"
          >
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Relatórios</span>
            <span className="sm:hidden">Relatórios</span>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs sm:text-sm">
                <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Importar em Massa</span>
                <span className="sm:hidden">Importar</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[95vw] sm:w-[600px] max-h-[80vh] overflow-y-auto p-0" align="end">
              <BulkImportPanel onImportComplete={onRefetch} showStageSelector={true} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SalesReportDialog
        open={reportsOpen}
        onOpenChange={setReportsOpen}
        leads={leads}
        stages={stages}
        callQueue={callQueue}
      />

      <ExportImportFunnelDialog
        open={exportImportOpen}
        onOpenChange={setExportImportOpen}
        leads={leads}
        onRefetch={onRefetch}
      />

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCorners} 
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="relative h-full">
          <Button
            variant="outline"
            size="icon"
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/95 backdrop-blur shadow-lg hover:bg-accent"
            onClick={() => handleScroll('left')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/95 backdrop-blur shadow-lg hover:bg-accent"
            onClick={() => handleScroll('right')}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <div ref={scrollContainerRef} className="flex gap-2 sm:gap-4 h-full overflow-x-auto overflow-y-hidden p-3 sm:p-6 pb-20 sm:pb-24 kanban-scroll pl-6 pr-6">
            {stages.map((stage) => {
              const columnLeads = normalizedLeads
                .filter((lead) => lead.stageId === stage.id)
                .sort((a, b) => {
                  const dateA = new Date(a.createdAt).getTime();
                  const dateB = new Date(b.createdAt).getTime();
                  return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
                });
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={columnLeads}
                  selectedLeadIds={selectedLeadIds}
                  onToggleSelection={toggleLeadSelection}
                  onToggleAllInStage={toggleAllInStage}
                  onLeadClick={setSelectedLead}
                  allStages={stages}
                  stagesLoading={stagesLoading}
                  onStageChange={onLeadUpdate}
                  instanceMap={instanceMap}
                  columnWidth={columnWidth}
                  onRefetch={onRefetch}
                  onEditLeadName={onEditLeadName}
                  compact={cardSize === 'compact'}
                  onDeleteLead={async (leadId) => {
                    await supabase
                      .from('leads')
                      .update({ deleted_at: new Date().toISOString() })
                      .eq('id', leadId);
                    toast({
                      title: "Lead excluído",
                      description: "O lead foi removido com sucesso",
                    });
                    onRefetch();
                  }}
                />
              );
            })}
          </div>
        </div>

        <style>{`
          .kanban-scroll::-webkit-scrollbar {
            width: 14px;
            height: 14px;
          }
          .kanban-scroll::-webkit-scrollbar-track {
            background: hsl(var(--muted));
            border-radius: 8px;
            margin: 4px;
          }
          .kanban-scroll::-webkit-scrollbar-thumb {
            background: hsl(var(--primary) / 0.5);
            border-radius: 8px;
            border: 2px solid hsl(var(--muted));
          }
          .kanban-scroll::-webkit-scrollbar-thumb:hover {
            background: hsl(var(--primary) / 0.7);
          }
          .kanban-scroll {
            scrollbar-width: auto;
            scrollbar-color: hsl(var(--primary) / 0.5) hsl(var(--muted));
          }
        `}</style>

        <DragOverlay>
          {activeLead ? (
            <LeadCard 
              lead={activeLead} 
              onClick={() => {}}
              stages={stages}
              stagesLoading={stagesLoading}
              onStageChange={() => {}}
              isSelected={false}
              onToggleSelection={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Barra de ações para seleção múltipla */}
      {selectedLeadIds.size > 0 && (
        <div className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground rounded-lg shadow-2xl border border-primary-foreground/20 px-3 sm:px-6 py-2 sm:py-4 flex items-center gap-2 sm:gap-4 animate-scale-in max-w-[95vw]">
          <Badge variant="secondary" className="px-2 sm:px-3 py-1 text-xs sm:text-base font-semibold shrink-0">
            {selectedLeadIds.size}
          </Badge>
          
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleMoveToNextStage}
              className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
            >
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Próxima Etapa</span>
              <span className="sm:hidden">Próx.</span>
            </Button>
            
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAddToListDialogOpen(true)}
              className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
            >
              <Send className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Lista de Disparo</span>
              <span className="sm:hidden">Lista</span>
            </Button>
            
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAddTagDialogOpen(true)}
              className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
            >
              <Tag className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Etiqueta</span>
              <span className="sm:hidden">Tag</span>
            </Button>
            
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAddToCallQueue}
              className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
            >
              <Phone className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Fila</span>
            </Button>
            
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
              className="gap-1 sm:gap-2 text-xs sm:text-sm"
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className="ml-1 sm:ml-2 hover:bg-primary-foreground/20 shrink-0"
          >
            <X className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      )}

        {selectedLead && (
          <LeadDetailModal
            lead={selectedLead}
            open={!!selectedLead}
            onClose={() => setSelectedLead(null)}
            onUpdated={onRefetch}
          />
        )}

      {/* Dialog para adicionar à lista de disparo */}
      <Dialog open={addToListDialogOpen} onOpenChange={setAddToListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Leads à Lista de Disparo</DialogTitle>
            <DialogDescription>
              Selecione uma lista para adicionar {selectedLeadIds.size} lead(s) selecionado(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selecione a Lista</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma lista..." />
                </SelectTrigger>
                <SelectContent>
                  {lists.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Nenhuma lista disponível. Crie uma lista primeiro em Disparo em Massa.
                    </div>
                  ) : (
                    lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        <div className="flex items-center gap-2">
                          <List className="h-4 w-4" />
                          {list.name} ({list.contacts.length} contatos)
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertDescription>
                Os leads selecionados serão adicionados à lista e poderão ser usados em campanhas de disparo em massa.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddToListDialogOpen(false);
                setSelectedListId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddToDisparoList}
              disabled={!selectedListId || isAddingToList}
            >
              {isAddingToList ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Adicionar à Lista
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para adicionar etiqueta aos leads selecionados */}
      <Dialog open={addTagDialogOpen} onOpenChange={setAddTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Etiqueta aos Leads</DialogTitle>
            <DialogDescription>
              Selecione uma etiqueta para adicionar aos {selectedLeadIds.size} lead(s) selecionado(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selecione a Etiqueta</Label>
              <Select value={selectedTagId} onValueChange={setSelectedTagId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma etiqueta..." />
                </SelectTrigger>
                <SelectContent>
                  {tags.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Nenhuma etiqueta disponível. Crie uma etiqueta primeiro.
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertDescription>
                A etiqueta será adicionada a todos os leads selecionados. Leads que já possuem esta etiqueta serão ignorados.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddTagDialogOpen(false);
                setSelectedTagId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddTagToSelected}
              disabled={!selectedTagId || isAddingTag}
            >
              {isAddingTag ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Tag className="h-4 w-4 mr-2" />
                  Adicionar Etiqueta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
