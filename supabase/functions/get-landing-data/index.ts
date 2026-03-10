// Landing page multi-empresa: retorna apenas dados de UMA organização (por slug).
// Produtos e serviços exibidos na landing são sempre da organização identificada pelo slug.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const slug = url.searchParams.get('slug')?.trim();

    if (!slug) {
      return new Response(
        JSON.stringify({ error: 'slug é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Buscar organização apenas por slug (uma única organização)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (orgError) {
      console.error('Erro ao buscar organização:', orgError);
      return new Response(
        JSON.stringify({ error: 'Erro ao carregar dados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!org) {
      return new Response(
        JSON.stringify({ error: 'Organização não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar apenas produtos ativos DESSA organização (multi-empresa: nunca outra org)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, price, category, image_url')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (productsError) {
      console.error('Erro ao buscar produtos:', productsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao carregar produtos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        organization: { id: org.id, name: org.name, slug: org.slug },
        products: products ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Erro get-landing-data:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
