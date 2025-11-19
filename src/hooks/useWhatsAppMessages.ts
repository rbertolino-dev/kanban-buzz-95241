import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveOrganization } from "@/hooks/useActiveOrganization";

export interface WhatsAppMessage {
  id: string;
  messageText: string;
  messageType: string;
  mediaUrl?: string;
  direction: 'incoming' | 'outgoing';
  timestamp: Date;
  readStatus: boolean;
}

export function useWhatsAppMessages(phone: string | null) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { activeOrgId } = useActiveOrganization();

  const fetchMessages = useCallback(async () => {
    if (!phone || !activeOrgId) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone', phone)
        .eq('organization_id', activeOrgId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      setMessages(
        (data || []).map((msg: any) => ({
          id: msg.id,
          messageText: msg.message_text,
          messageType: msg.message_type,
          mediaUrl: msg.media_url,
          direction: msg.direction,
          timestamp: new Date(msg.timestamp),
          readStatus: msg.read_status,
        }))
      );

      // Marcar mensagens como lidas
      if (data && data.length > 0) {
        await supabase
          .from('whatsapp_messages')
          .update({ read_status: true })
          .eq('phone', phone)
          .eq('organization_id', activeOrgId)
          .eq('direction', 'incoming')
          .eq('read_status', false);
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Erro ao carregar mensagens",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [phone, activeOrgId, toast]);

  useEffect(() => {
    fetchMessages();

    if (!phone || !activeOrgId) return;

    // Realtime para novas mensagens - filtra por phone E organization
    const channel = supabase
      .channel(`whatsapp_messages_${phone}_${activeOrgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `phone=eq.${phone},organization_id=eq.${activeOrgId}`,
        },
        (payload) => {
          console.log('📨 Nova mensagem recebida via realtime:', payload);
          fetchMessages();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal realtime:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          toast({
            title: 'Falha no Realtime',
            description: 'Problema ao receber atualizações desta conversa. Tentando reconectar...',
            variant: 'destructive',
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phone, activeOrgId, fetchMessages, toast]);

  return {
    messages,
    loading,
    refetch: fetchMessages,
  };
}