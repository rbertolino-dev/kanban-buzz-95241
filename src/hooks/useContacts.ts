import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUserOrganizationId } from "@/lib/organizationUtils";
import { Tag } from "@/hooks/useTags";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  value?: number;
  status: string;
  source: string;
  assignedTo: string;
  lastContact: Date;
  createdAt: Date;
  returnDate?: Date;
  sourceInstanceId?: string;
  notes?: string;
  stageId?: string;
  stageName?: string;
  stageColor?: string;
  tags?: Tag[];
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchContacts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setContacts([]);
        setLoading(false);
        return;
      }

      // Pegar a organização ativa do localStorage
      const organizationId = await getUserOrganizationId();
      if (!organizationId) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const { data: leadsData, error: leadsError } = await (supabase as any)
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('name', { ascending: true });

      if (leadsError) throw leadsError;

      // Fetch stages and tags for each lead
      const contactsWithDetails = await Promise.all(
        (leadsData || []).map(async (lead: any) => {
          // Get stage info
          let stageName, stageColor;
          if (lead.stage_id) {
            const { data: stage } = await (supabase as any)
              .from('pipeline_stages')
              .select('name, color')
              .eq('id', lead.stage_id)
              .maybeSingle();
            stageName = stage?.name;
            stageColor = stage?.color;
          }

          // Get tags
          const { data: leadTags } = await (supabase as any)
            .from('lead_tags')
            .select('tag_id, tags(id, name, color)')
            .eq('lead_id', lead.id);

          const statusRaw = (lead.status || '').toLowerCase();
          const statusMap: Record<string, string> = { new: 'novo' };
          const mappedStatus = statusMap[statusRaw] || (statusRaw as string);

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
            stageName,
            stageColor,
            tags: (leadTags || []).map((lt: any) => lt.tags).filter(Boolean),
          } as Contact;
        })
      );

      setContacts(contactsWithDetails);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar contatos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContacts();

    // Realtime: subscribe to changes
    const channel = supabase
      .channel('contacts-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        () => {
          fetchContacts();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        () => {
          fetchContacts();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leads' },
        () => {
          fetchContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchContacts]);

  return { contacts, loading, refetch: fetchContacts };
}

