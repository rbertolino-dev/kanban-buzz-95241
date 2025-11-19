import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getUserOrganizationId } from '@/lib/organizationUtils';

interface AutoSyncOptions {
  intervalMinutes?: number;
  enabled?: boolean;
}

export function useAutoSync({ intervalMinutes = 5, enabled = true }: AutoSyncOptions = {}) {
  const { toast } = useToast();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [nextSync, setNextSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncMessages = useCallback(async () => {
    if (isSyncing) {
      console.log('⏭️ Sincronização já em andamento, pulando...');
      return;
    }

    setIsSyncing(true);
    try {
      console.log('🔄 Iniciando sincronização automática...');
      
      // Buscar configuração do usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('⚠️ Usuário não autenticado');
        return;
      }

      const { data: config, error: configError } = await (supabase as any)
        .from('evolution_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (configError || !config) {
        console.log('⚠️ Configuração Evolution não encontrada');
        return;
      }

      if (!config.is_connected) {
        console.log('⚠️ Evolution API não está conectada');
        return;
      }

      // Buscar mensagens não lidas da Evolution API
      const normalizeUrl = (url: string) => {
        try {
          const u = new URL(url);
          let base = u.origin + u.pathname.replace(/\/$/, '');
          base = base.replace(/\/(manager|dashboard|app)$/, '');
          return base;
        } catch {
          return url.replace(/\/$/, '').replace(/\/(manager|dashboard|app)$/, '');
        }
      };

      const apiUrl = `${normalizeUrl(config.api_url)}/chat/findMessages/${config.instance_name}`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.api_key || '',
        },
        body: JSON.stringify({
          where: {
            key: {
              fromMe: false
            }
          },
          limit: 50
        })
      });

      if (!response.ok) {
        console.error('❌ Erro ao buscar mensagens:', response.status);
        return;
      }

      const messages = await response.json();
      console.log(`📨 ${messages.length || 0} mensagens encontradas`);

      // Processar mensagens
      if (Array.isArray(messages) && messages.length > 0) {
        for (const msg of messages) {
          if (!msg.key?.fromMe && msg.key?.remoteJid) {
            const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const messageContent = msg.message?.conversation || 
                                  msg.message?.extendedTextMessage?.text || 
                                  '[Mensagem de mídia]';
            const contactName = msg.pushName || phoneNumber;

            // Verificar se já existe lead
            const { data: existingLead } = await (supabase as any)
              .from('leads')
              .select('id')
              .eq('phone', phoneNumber)
              .eq('user_id', user.id)
              .single();

            if (!existingLead) {
              // Criar novo lead
              const orgId = await getUserOrganizationId();
              const { data: newLead, error: leadError } = await (supabase as any)
                .from('leads')
                .insert({
                  user_id: user.id,
                  organization_id: orgId,
                  name: contactName,
                  phone: phoneNumber,
                  source: 'whatsapp',
                  status: 'novo',
                  last_contact: new Date().toISOString(),
                })
                .select()
                .single();

              if (!leadError && newLead) {
                // Adicionar atividade
                await (supabase as any).from('activities').insert({
                  lead_id: newLead.id,
                  type: 'whatsapp',
                  content: messageContent,
                  user_name: contactName,
                  direction: 'inbound',
                });

                console.log(`✅ Novo lead criado via sync: ${contactName}`);
              }
            }
          }
        }
      }

      console.log('✅ Sincronização concluída');
      setLastSync(new Date());

    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!enabled) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    // Executar sincronização inicial após 10 segundos
    const initialTimeout = setTimeout(() => {
      syncMessages();
      setNextSync(new Date(Date.now() + intervalMinutes * 60 * 1000));
    }, 10000);

    // Configurar intervalo de sincronização
    syncIntervalRef.current = setInterval(() => {
      syncMessages();
      setNextSync(new Date(Date.now() + intervalMinutes * 60 * 1000));
    }, intervalMinutes * 60 * 1000);

    // Calcular próxima sincronização
    setNextSync(new Date(Date.now() + 10000 + intervalMinutes * 60 * 1000));

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [enabled, intervalMinutes, syncMessages]);

  const manualSync = async () => {
    await syncMessages();
    setNextSync(new Date(Date.now() + intervalMinutes * 60 * 1000));
  };

  return { 
    syncNow: manualSync,
    lastSync,
    nextSync,
    isSyncing
  };
}
