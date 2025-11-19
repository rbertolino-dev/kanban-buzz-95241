import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUserOrganizationId } from "@/lib/organizationUtils";

export interface LidContact {
  id: string;
  lid: string;
  name: string;
  profile_pic_url?: string;
  notes?: string;
  last_contact?: Date;
  created_at: Date;
}

export function useLidContacts() {
  const [lidContacts, setLidContacts] = useState<LidContact[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLidContacts = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Erro de autenticação",
          description: "Faça login para ver os contatos",
          variant: "destructive",
        });
        return;
      }

      // Filtrar pela organização ativa
      const organizationId = await getUserOrganizationId();
      if (!organizationId) {
        setLidContacts([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('whatsapp_lid_contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('last_contact', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLidContacts(
        (data || []).map((contact: any) => ({
          ...contact,
          last_contact: contact.last_contact ? new Date(contact.last_contact) : undefined,
          created_at: new Date(contact.created_at),
        }))
      );
    } catch (error: any) {
      console.error('Error fetching LID contacts:', error);
      toast({
        title: "Erro ao carregar contatos LID",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const deleteLidContact = async (id: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_lid_contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Contato removido",
        description: "O contato LID foi removido com sucesso",
      });

      await fetchLidContacts();
      return true;
    } catch (error: any) {
      toast({
        title: "Erro ao remover contato",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchLidContacts();

    const channel = supabase
      .channel('whatsapp_lid_contacts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_lid_contacts',
        },
        () => {
          fetchLidContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLidContacts]);

  return {
    lidContacts,
    loading,
    deleteLidContact,
    refetch: fetchLidContacts,
  };
}
