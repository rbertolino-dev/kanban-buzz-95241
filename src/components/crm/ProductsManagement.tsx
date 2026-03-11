import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProducts } from "@/hooks/useProducts";
import { Product, ProductFormData } from "@/types/product";
import { Plus, Edit, Trash2, Package, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export function ProductsManagement() {
  const {
    products,
    loading,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductsByCategory,
  } = useProducts();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    description: "",
    price: 0,
    category: "",
    is_active: true,
  });

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedProducts = getProductsByCategory();

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || "",
        price: product.price,
        category: product.category,
        is_active: product.is_active,
        commission_percentage: product.commission_percentage || 0,
        commission_fixed: product.commission_fixed || 0,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        description: "",
        price: 0,
        category: "",
        is_active: true,
        commission_percentage: 0,
        commission_fixed: 0,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProduct(null);
    setFormData({
      name: "",
      description: "",
      price: 0,
      category: "",
      is_active: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.price || !formData.category) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, preço e categoria.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData);
      } else {
        await createProduct(formData);
      }
      handleCloseDialog();
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleDelete = async (product: Product) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir o produto "${product.name}"? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    try {
      await deleteProduct(product.id);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Carregando produtos...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com ações */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Produtos e Serviços</h2>
          <p className="text-muted-foreground">
            Gerencie os produtos e serviços que podem ser vinculados aos leads
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </DialogTitle>
              <DialogDescription>
                {editingProduct
                  ? "Atualize as informações do produto"
                  : "Preencha os dados do novo produto ou serviço"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nome do Produto/Serviço <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Consultoria, Software, Produto X"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Descreva o produto ou serviço..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">
                    Preço <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commission_percentage">
                    Comissão (%)
                  </Label>
                  <Input
                    id="commission_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.commission_percentage || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        commission_percentage: parseFloat(e.target.value) || 0,
                        commission_fixed: formData.commission_fixed && parseFloat(e.target.value) > 0 ? 0 : formData.commission_fixed,
                      })
                    }
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Percentual sobre o valor da venda
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission_fixed">
                    Comissão Fixa (R$)
                  </Label>
                  <Input
                    id="commission_fixed"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.commission_fixed || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        commission_fixed: parseFloat(e.target.value) || 0,
                        commission_percentage: formData.commission_percentage && parseFloat(e.target.value) > 0 ? 0 : formData.commission_percentage,
                      })
                    }
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor fixo por venda (ou use percentual)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">
                    Categoria <span className="text-red-500">*</span>
                  </Label>
                  {categories.length > 0 ? (
                    <div className="space-y-2">
                      <Select
                        value={categories.includes(formData.category) ? formData.category : "__new__"}
                        onValueChange={(value) => {
                          if (value === "__new__") {
                            setFormData({ ...formData, category: "" });
                          } else {
                            setFormData({ ...formData, category: value });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__">+ Nova categoria</SelectItem>
                        </SelectContent>
                      </Select>
                      {(!categories.includes(formData.category) || formData.category === "") && (
                        <Input
                          placeholder="Digite o nome da nova categoria"
                          value={formData.category === "__new__" ? "" : formData.category}
                          onChange={(e) =>
                            setFormData({ ...formData, category: e.target.value })
                          }
                          autoFocus
                        />
                      )}
                    </div>
                  ) : (
                    <Input
                      placeholder="Digite o nome da categoria (ex: Software, Consultoria)"
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Produto ativo (disponível para venda)
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingProduct ? "Salvar Alterações" : "Criar Produto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou descrição..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Produtos */}
      <Card>
        <CardHeader>
          <CardTitle>
            Produtos ({filteredProducts.length})
          </CardTitle>
          <CardDescription>
            {filteredProducts.filter((p) => p.is_active).length} ativos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum produto encontrado</p>
              <p className="text-sm mt-2">
                {searchQuery || selectedCategory !== "all"
                  ? "Tente ajustar os filtros"
                  : "Crie seu primeiro produto ou serviço"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(
                filteredProducts.reduce((acc, product) => {
                  if (!acc[product.category]) {
                    acc[product.category] = [];
                  }
                  acc[product.category].push(product);
                  return acc;
                }, {} as Record<string, Product[]>)
              ).map(([category, categoryProducts]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {category}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">
                            {product.name}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {product.description || "—"}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{formatCurrency(product.price)}</span>
                              {(product.commission_percentage || product.commission_fixed) && (
                                <span className="text-xs text-muted-foreground">
                                  {product.commission_percentage
                                    ? `Comissão: ${product.commission_percentage}%`
                                    : `Comissão: ${formatCurrency(product.commission_fixed || 0)}`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={product.is_active ? "default" : "secondary"}
                            >
                              {product.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(
                              new Date(product.created_at),
                              "dd/MM/yyyy",
                              { locale: ptBR }
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(product)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(product)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

