import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveOrganization } from "@/hooks/useActiveOrganization";

export interface WhatsAppChat {
  phone: string;
  contactName: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  direction: 'incoming' | 'outgoing';
}

export function useWhatsAppChats() {
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { activeOrgId } = useActiveOrganization();

  const fetchChats = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Erro de autenticação",
          description: "Faça login para ver as conversas",
          variant: "destructive",
        });
        return;
      }
      if (!activeOrgId) return;

      // Buscar últimas mensagens da organização
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('organization_id', activeOrgId)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      // Agrupar por telefone e pegar última mensagem
      const chatMap = new Map<string, WhatsAppChat>();
      
      data?.forEach((msg: any) => {
        if (!chatMap.has(msg.phone)) {
          chatMap.set(msg.phone, {
            phone: msg.phone,
            contactName: msg.contact_name || msg.phone,
            lastMessage: msg.message_text || '[Mídia]',
            lastMessageTime: new Date(msg.timestamp),
            unreadCount: msg.direction === 'incoming' && !msg.read_status ? 1 : 0,
            direction: msg.direction,
          });
        } else {
          // Incrementar contador de não lidas
          const chat = chatMap.get(msg.phone)!;
          if (msg.direction === 'incoming' && !msg.read_status) {
            chat.unreadCount++;
          }
        }
      });

      const chatsList = Array.from(chatMap.values())
        .sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());

      setChats(chatsList);
    } catch (error: any) {
      console.error('Error fetching chats:', error);
      toast({
        title: "Erro ao carregar conversas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, toast]);

  useEffect(() => {
    fetchChats();

    if (!activeOrgId) return;

    // Realtime para atualizar quando novas mensagens chegarem
    const channel = supabase
      .channel(`whatsapp_messages_changes_${activeOrgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `organization_id=eq.${activeOrgId}`,
        },
        (payload) => {
          console.log('📨 Nova mensagem recebida na org via realtime:', payload);
          fetchChats();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal realtime chats:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          toast({
            title: 'Falha no Realtime (Chats)',
            description: 'Problema ao receber atualizações da lista de conversas. Tentando reconectar...',
            variant: 'destructive',
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrgId, fetchChats, toast]);

  return {
    chats,
    loading,
    refetch: fetchChats,
  };
}