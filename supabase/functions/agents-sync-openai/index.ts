import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_URL = "https://api.openai.com/v1/assistants";

serve(async (req) => {
  console.log("🟢🟢🟢 [agents-sync-openai] INÍCIO DA EXECUÇÃO");
  console.log("📋 [agents-sync-openai] Método:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📋 [agents-sync-openai] Lendo body da requisição...");
    const { agent_id } = await req.json();
    console.log("📋 [agents-sync-openai] AgentId recebido:", agent_id);

    if (!agent_id) {
      console.error("❌ [agents-sync-openai] agent_id não fornecido!");
      return new Response(
        JSON.stringify({ error: "agent_id é obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("🔍 [agents-sync-openai] Buscando variáveis de ambiente...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("📋 [agents-sync-openai] SUPABASE_URL presente:", !!supabaseUrl);
    console.log("📋 [agents-sync-openai] SUPABASE_SERVICE_ROLE_KEY presente:", !!supabaseKey);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Variáveis de ambiente do Supabase não configuradas");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔍 [agents-sync-openai] Buscando agente no banco...");
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    console.log("📦 [agents-sync-openai] Resultado da busca:", { agent: agent ? "encontrado" : "não encontrado", agentError });

    if (agentError || !agent) {
      console.error("❌ [agents-sync-openai] Erro ao buscar agente:", agentError);
      throw new Error(agentError?.message || "Agente não encontrado");
    }

    console.log("✅ [agents-sync-openai] Agente encontrado:", agent.name);
    console.log("🔍 [agents-sync-openai] Buscando API key da organização...");
    
    // Buscar API key da tabela openai_configs
    const { data: openaiConfig, error: configError } = await supabase
      .from("openai_configs")
      .select("api_key")
      .eq("organization_id", agent.organization_id)
      .single();

    console.log("📦 [agents-sync-openai] Resultado da busca da config:", { 
      encontrado: !!openaiConfig, 
      configError 
    });

    if (configError || !openaiConfig) {
      console.error("❌ [agents-sync-openai] Erro ao buscar config OpenAI:", configError);
      throw new Error(
        "Configuração OpenAI não encontrada para esta organização. Configure a API key no botão 'Configurar OpenAI'."
      );
    }

    const openaiKey = openaiConfig.api_key;
    console.log("📋 [agents-sync-openai] API key encontrada:", !!openaiKey);

    if (!openaiKey) {
      console.error("❌ [agents-sync-openai] API key vazia na configuração!");
      throw new Error(
        "API key OpenAI não configurada para esta organização. Configure no botão 'Configurar OpenAI'."
      );
    }

    const personaBlock = agent.persona
      ? `Persona:\n${JSON.stringify(agent.persona)}`
      : null;

    const policyArray = Array.isArray(agent.policies)
      ? (agent.policies as ReadonlyArray<Record<string, unknown> | string>)
      : [];

    const policiesBlock =
      policyArray.length > 0
        ? `Políticas:\n${policyArray
            .map((policy, idx) => {
              if (typeof policy === "string") {
                return `${idx + 1}. ${policy}`;
              }
              if (policy && typeof policy === "object" && "text" in policy) {
                const textValue = (policy as { text?: unknown }).text;
                if (typeof textValue === "string" && textValue.length > 0) {
                  return `${idx + 1}. ${textValue}`;
                }
              }
              return `${idx + 1}. ${JSON.stringify(policy)}`;
            })
            .join("\n")}`
        : null;

    // Construir guardrails block
    const guardrailsBlock = agent.guardrails
      ? `REGRAS OBRIGATÓRIAS:\n${agent.guardrails}`
      : null;

    // Construir few-shot examples block
    const fewShotBlock = agent.few_shot_examples
      ? `EXEMPLOS DE BOAS RESPOSTAS:\n${agent.few_shot_examples}`
      : null;

    // Instruções para Response Format JSON
    const jsonFormatInstructions = `
IMPORTANTE: Responda SEMPRE em JSON válido com esta estrutura:
{
  "resposta": "sua resposta aqui",
  "confianca": 0-100,
  "precisa_escalacao": true/false
}

Se "confianca" for menor que 70 ou você não tiver certeza da resposta, defina "precisa_escalacao" como true.
    `.trim();

    const baseInstructions = [
      agent.prompt_instructions,
      personaBlock,
      policiesBlock,
      guardrailsBlock,
      fewShotBlock,
      jsonFormatInstructions,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const metadata = (agent.metadata || {}) as Record<string, unknown>;
    const toolsValue = (metadata as { tools?: unknown }).tools;
    const tools = Array.isArray(toolsValue) ? toolsValue : [];

    // OpenAI has a 512 character limit for description
    const truncatedDescription = agent.description 
      ? agent.description.substring(0, 512)
      : undefined;

    const assistantPayload = {
      name: agent.name,
      description: truncatedDescription,
      model: agent.model || "gpt-4o-mini",
      temperature: agent.temperature ?? 0.6,
      instructions: baseInstructions || undefined,
      response_format: { type: "json_object" },
      metadata: {
        organization_id: String(agent.organization_id || ""),
        agent_id: String(agent.id || ""),
        version: String(agent.version ?? 1),
      },
      tools,
    };

    const headers = {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    };

    let url = agent.openai_assistant_id
      ? `${OPENAI_API_URL}/${agent.openai_assistant_id}`
      : OPENAI_API_URL;
    let method = agent.openai_assistant_id ? "POST" : "POST";

    console.log("🚀 [agents-sync-openai] Chamando OpenAI API...");
    console.log("📋 [agents-sync-openai] URL:", url);
    console.log("📋 [agents-sync-openai] Método:", method);
    console.log("📋 [agents-sync-openai] Assistant ID existente:", agent.openai_assistant_id || "nenhum");
    console.log("📋 [agents-sync-openai] Payload:", JSON.stringify(assistantPayload, null, 2));

    let response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(assistantPayload),
    });

    console.log("📡 [agents-sync-openai] Status da resposta OpenAI:", response.status);
    console.log("📡 [agents-sync-openai] Status text:", response.statusText);

    // Se o assistente não existe mais (404), criar um novo
    if (!response.ok && response.status === 404 && agent.openai_assistant_id) {
      console.log("⚠️ [agents-sync-openai] Assistente não encontrado (404), criando novo...");
      
      url = OPENAI_API_URL;
      method = "POST";
      
      response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(assistantPayload),
      });
      
      console.log("📡 [agents-sync-openai] Nova tentativa - Status:", response.status);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [agents-sync-openai] OpenAI error:", errorText);
      console.error("❌ [agents-sync-openai] Status:", response.status);
      throw new Error(
        `Falha ao sincronizar com OpenAI: ${response.status} ${errorText}`
      );
    }

    const result = await response.json();

    const { error: updateError } = await supabase
      .from("agents")
      .update({
        openai_assistant_id: result.id,
        status: agent.status === "draft" ? "active" : agent.status,
      })
      .eq("id", agent_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        assistantId: result.id,
        assistant: result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌❌❌ [agents-sync-openai] ERRO CAPTURADO:");
    console.error("📋 [agents-sync-openai] Tipo:", typeof error);
    console.error("📋 [agents-sync-openai] Mensagem:", error instanceof Error ? error.message : String(error));
    console.error("📋 [agents-sync-openai] Stack:", error instanceof Error ? error.stack : "N/A");
    console.error("📋 [agents-sync-openai] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : "Erro desconhecido";
    
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

