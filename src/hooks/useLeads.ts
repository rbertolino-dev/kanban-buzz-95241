import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead, LeadStatus, Activity } from "@/types/lead";
import { useToast } from "@/hooks/use-toast";
import { getUserOrganizationId } from "@/lib/organizationUtils";

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLeads = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLeads([]);
        toast({
          title: "Você não está autenticado",
          description: "Faça login para visualizar seus leads conectados.",
        });
        return;
      }

      // Pegar a organização ativa do localStorage
      const organizationId = await getUserOrganizationId();
      if (!organizationId) {
        setLeads([]);
        return;
      }

      const { data: leadsData, error: leadsError } = await (supabase as any)
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (leadsError) throw leadsError;

      // Fetch activities and tags for each lead
      const leadsWithActivities = await Promise.all(
        (leadsData || []).map(async (lead) => {
          const { data: activities } = await (supabase as any)
            .from('activities')
            .select('*')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false });

          const { data: leadTags } = await (supabase as any)
            .from('lead_tags')
            .select('tag_id, tags(id, name, color)')
            .eq('lead_id', lead.id);

          const statusRaw = (lead.status || '').toLowerCase();
          const statusMap: Record<string, LeadStatus> = { new: 'novo' };
          const mappedStatus = statusMap[statusRaw] || (statusRaw as LeadStatus);
          return {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email || undefined,
            company: lead.company || undefined,
            value: lead.value || undefined,
            status: mappedStatus,
            source: lead.source || 'WhatsApp',
            assignedTo: lead.assigned_to || 'Não atribuído',
            lastContact: lead.last_contact ? new Date(lead.last_contact) : new Date(),
            createdAt: new Date(lead.created_at!),
            returnDate: lead.return_date ? new Date(lead.return_date) : undefined,
            sourceInstanceId: lead.source_instance_id || undefined,
            notes: lead.notes || undefined,
            stageId: lead.stage_id || undefined,
            activities: (activities || []).map((a) => ({
              id: a.id,
              type: a.type as Activity['type'],
              content: a.content,
              timestamp: new Date(a.created_at!),
              user: a.user_name || 'Sistema',
            })),
            tags: (leadTags || []).map((lt: any) => lt.tags).filter(Boolean),
          } as Lead;
        })
      );

      setLeads(leadsWithActivities);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar leads",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLeads();

    // Realtime: subscribe to changes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          console.log('🆕 Novo lead inserido:', payload.new);
          const newLead = payload.new as any;
          toast({
            title: 'Novo contato adicionado!',
            description: `${newLead.name || newLead.phone} foi adicionado ao funil`,
          });
          fetchLeads();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          console.log('🔄 Lead atualizado (realtime):', payload.new);
          fetchLeads();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leads' },
        () => {
          console.log('🗑️ Lead excluído (realtime)');
          fetchLeads();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal realtime:', status);
      });

    return () => {
      console.log('🔌 Desconectando realtime...');
      supabase.removeChannel(channel);
    };
  }, [fetchLeads, toast]);

  const updateLeadStatus = async (leadId: string, newStageId: string) => {
    try {
      console.log('🔄 Atualizando lead:', { leadId, newStageId });

      // Optimistic UI update to move the card immediately
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, stageId: newStageId, lastContact: new Date() } : l
        )
      );

      const organizationId = await getUserOrganizationId();
      if (!organizationId) throw new Error('Usuário não pertence a uma organização');

      const { error: updateError } = await supabase
        .from('leads')
        .update({
          stage_id: newStageId,
          last_contact: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (updateError) {
        console.error('❌ Erro ao atualizar lead:', updateError);
        throw updateError;
      }


      // Add activity (org-scoped)
      const { error: activityError } = await supabase.from('activities').insert({
        lead_id: leadId,
        organization_id: organizationId,
        type: 'status_change',
        content: 'Lead movido para nova etapa',
        user_name: 'Sistema',
      });
      if (activityError) console.warn('⚠️ Erro ao criar atividade:', activityError);

      toast({
        title: 'Status atualizado',
        description: 'O lead foi movido para a nova etapa com sucesso.',
      });
    } catch (error: any) {
      console.error('💥 Erro geral ao atualizar lead:', error);
      toast({
        title: 'Erro ao atualizar lead',
        description: error.message,
        variant: 'destructive',
      });
      // Rollback by refetching from server
      await fetchLeads();
    }
  };

  const deleteLead = async (leadId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', leadId);

      if (error) throw error;

      toast({
        title: "Contato excluído",
        description: "O contato foi removido do funil.",
      });

      await fetchLeads();
      return true;
    } catch (error: any) {
      toast({
        title: "Erro ao excluir contato",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  return { leads, loading, updateLeadStatus, deleteLead, refetch: fetchLeads };
}
