-- Slug em organizations para landing page multi-empresa (URL amigável por organização)
-- Cada organização tem sua landing em /loja/:slug com apenas seus produtos/serviços

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Índice único para slug (permite NULL temporariamente para backfill)
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug) WHERE slug IS NOT NULL;

-- Backfill: gera slug a partir do name (normalizado: minúsculo, sem acentos, espaços -> hífen)
-- Só preenche onde slug ainda é NULL
UPDATE public.organizations o
SET slug = LOWER(
  REGEXP_REPLACE(
    TRIM(
      TRANSLATE(name, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
    ),
    '\s+', '-', 'g'
  )
)
WHERE o.slug IS NULL AND o.name IS NOT NULL AND TRIM(o.name) <> '';

-- Para orgs com mesmo name, torna slug único acrescentando sufixo (apenas duplicados)
WITH numbered AS (
  SELECT id, slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
  FROM public.organizations
  WHERE slug IS NOT NULL
)
UPDATE public.organizations o
SET slug = o.slug || '-' || LEFT(REPLACE(o.id::text, '-', ''), 8)
FROM numbered n
WHERE n.id = o.id AND n.rn > 1;

-- Agora exige NOT NULL para novas orgs (constraint só via aplicação ou trigger; opcional)
COMMENT ON COLUMN public.organizations.slug IS 'Identificador único na URL da landing page (ex: /loja/:slug). Usado para multi-empresa.';
