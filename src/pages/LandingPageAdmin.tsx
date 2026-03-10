/**
 * Página admin da funcionalidade landing-page.
 * Acesso: /landing-page (sem slug). Exibe link da landing pública e slug da organização.
 * Não usa ícone Clock para evitar ReferenceError: Clock is not defined.
 */
import { useState, useEffect } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CRMLayout, CRMView } from "@/components/crm/CRMLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, ExternalLink, Copy, Loader2 } from "lucide-react";
import { useActiveOrganization } from "@/hooks/useActiveOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function LandingPageAdmin() {
  const { activeOrgId } = useActiveOrganization();
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("organizations")
      .select("slug")
      .eq("id", activeOrgId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.slug) setSlug(data.slug);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const handleViewChange = (view: CRMView) => {
    if (view === "broadcast") window.location.href = "/broadcast";
    else if (view === "settings") window.location.href = "/settings";
    else window.location.href = "/";
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = slug ? `${baseUrl}/landing-page/${slug}` : null;

  const copyUrl = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast({ title: "Link copiado", description: "URL da landing page copiada." });
  };

  return (
    <AuthGuard>
      <CRMLayout activeView="settings" onViewChange={handleViewChange}>
        <div className="container mx-auto p-6 max-w-2xl">
          <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Store className="h-7 w-7" />
            Landing Page
          </h1>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando...
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Sua página pública</CardTitle>
                <CardDescription>
                  Esta é a URL onde clientes veem os produtos e serviços da sua organização.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {slug && publicUrl ? (
                  <>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                      <span className="text-sm font-mono truncate flex-1">{publicUrl}</span>
                      <Button variant="outline" size="sm" onClick={copyUrl}>
                        <Copy className="h-4 w-4 mr-1" />
                        Copiar
                      </Button>
                    </div>
                    <Button asChild variant="secondary">
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir landing page
                      </a>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A organização ainda não tem um slug configurado. O slug é gerado a partir do nome da organização. Entre em contato com o suporte ou edite a organização para que o slug seja definido.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CRMLayout>
    </AuthGuard>
  );
}
