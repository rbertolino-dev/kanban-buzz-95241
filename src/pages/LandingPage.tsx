/**
 * Funcionalidade landing-page (multi-empresa): exibe apenas produtos e serviços da organização
 * identificada pelo slug na URL (/landing-page/:slug). Dados vêm da API get-landing-data
 * e são sempre filtrados por organização — nenhum dado de outra empresa é exibido.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Loader2, Store } from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

interface LandingProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  image_url?: string | null;
}

interface LandingData {
  organization: { id: string; name: string; slug: string | null };
  products: LandingProduct[];
}

export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Endereço inválido.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const url = `${supabaseUrl}/functions/v1/get-landing-data?slug=${encodeURIComponent(slug)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) return { error: "Organização não encontrada" };
          return res.json().catch(() => ({ error: "Erro ao carregar" }));
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData({
            organization: json.organization,
            products: json.products ?? [],
          });
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível carregar os dados.");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Página não encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error ?? "Organização não encontrada."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { organization, products } = data;
  const byCategory = products.reduce<Record<string, LandingProduct[]>>((acc, p) => {
    const cat = p.category || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Store className="h-6 w-6" />
            {organization.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Produtos e serviços
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum produto ou serviço disponível no momento.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(byCategory).map(([category, items]) => (
              <section key={category}>
                <h2 className="text-lg font-medium mb-4">{category}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((product) => (
                    <Card key={product.id} className="overflow-hidden">
                      {product.image_url && (
                        <div className="aspect-video w-full bg-muted">
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{product.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {product.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {product.description}
                          </p>
                        )}
                        <p className="font-medium">
                          {typeof product.price === "number"
                            ? new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(product.price)
                            : product.price}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
