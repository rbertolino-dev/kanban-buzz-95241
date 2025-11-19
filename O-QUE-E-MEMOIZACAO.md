# O Que É Memoização (Memoization)?

## Explicação Simples

**Memoização** é uma técnica de otimização que "lembra" o resultado de uma função para não precisar recalcular quando os mesmos parâmetros são usados novamente.

É como ter uma "memória" ou "cache" para evitar trabalho repetido.

---

## Exemplo do Dia a Dia

Imagine que você precisa calcular `2 + 2` várias vezes:

**SEM memoização:**
```
Pergunta 1: "Quanto é 2 + 2?"
→ Calcula: 2 + 2 = 4

Pergunta 2: "Quanto é 2 + 2?" (mesma pergunta!)
→ Calcula NOVAMENTE: 2 + 2 = 4 (trabalho repetido!)

Pergunta 3: "Quanto é 2 + 2?" (mesma pergunta!)
→ Calcula NOVAMENTE: 2 + 2 = 4 (trabalho repetido!)
```

**COM memoização:**
```
Pergunta 1: "Quanto é 2 + 2?"
→ Calcula: 2 + 2 = 4
→ Salva na memória: "2+2 = 4"

Pergunta 2: "Quanto é 2 + 2?" (mesma pergunta!)
→ Olha na memória: "Ah, já calculei isso! É 4"
→ Retorna 4 SEM recalcular! ✅

Pergunta 3: "Quanto é 2 + 2?" (mesma pergunta!)
→ Olha na memória: "Ah, já calculei isso! É 4"
→ Retorna 4 SEM recalcular! ✅
```

---

## No React: useCallback

No React, `useCallback` é uma forma de memoizar **funções**.

### Problema SEM useCallback:

```typescript
function MeuComponente() {
  const [contador, setContador] = useState(0);
  
  // ❌ Esta função é RECRIADA toda vez que o componente renderiza
  const buscarDados = async () => {
    console.log('Buscando dados...');
    // ... código para buscar dados
  };
  
  useEffect(() => {
    buscarDados();
  }, []); // Só executa uma vez
  
  return <div>Contador: {contador}</div>;
}
```

**O que acontece:**
- Toda vez que `contador` muda, o componente renderiza
- `buscarDados` é **recriada** (nova função)
- Mesmo que seja a mesma função, o React vê como "diferente"
- Isso pode causar re-renders desnecessários

### Solução COM useCallback:

```typescript
function MeuComponente() {
  const [contador, setContador] = useState(0);
  
  // ✅ Esta função é MEMOIZADA (lembrada)
  // Só é recriada se as dependências mudarem
  const buscarDados = useCallback(async () => {
    console.log('Buscando dados...');
    // ... código para buscar dados
  }, []); // Array vazio = nunca recria (só uma vez)
  
  useEffect(() => {
    buscarDados();
  }, [buscarDados]);
  
  return <div>Contador: {contador}</div>;
}
```

**O que acontece:**
- `buscarDados` é criada **uma vez** e "lembrada"
- Quando `contador` muda, `buscarDados` **não é recriada**
- React vê que é a mesma função (referência igual)
- Evita re-renders desnecessários ✅

---

## No Nosso Código Corrigido

### ANTES (sem memoização):

```typescript
export function useWhatsAppMessages(phone: string | null) {
  const { toast } = useToast();
  const { activeOrgId } = useActiveOrganization();
  
  // ❌ Esta função é RECRIADA toda vez que o componente renderiza
  const fetchMessages = async () => {
    // usa phone, activeOrgId, toast
  };
  
  useEffect(() => {
    fetchMessages();
  }, [phone, activeOrgId]); // ❌ fetchMessages não está aqui
}
```

**Problema:**
- Toda vez que o componente renderiza, `fetchMessages` é uma **nova função**
- O `useEffect` pode usar uma versão **antiga** da função (stale closure)
- Se `phone` ou `activeOrgId` mudarem, pode usar valores antigos

### DEPOIS (com memoização):

```typescript
export function useWhatsAppMessages(phone: string | null) {
  const { toast } = useToast();
  const { activeOrgId } = useActiveOrganization();
  
  // ✅ Esta função é MEMOIZADA
  // Só é recriada se phone, activeOrgId ou toast mudarem
  const fetchMessages = useCallback(async () => {
    // usa phone, activeOrgId, toast
  }, [phone, activeOrgId, toast]); // Dependências: quando recriar
  
  useEffect(() => {
    fetchMessages();
  }, [phone, activeOrgId, fetchMessages, toast]); // ✅ Todas dependências
}
```

**Benefícios:**
- `fetchMessages` só é recriada quando `phone`, `activeOrgId` ou `toast` mudam
- React "lembra" a função entre renders
- Evita stale closures (sempre usa valores atualizados)
- Melhor performance (menos re-renders)

---

## Analogia com Cache

Memoização é como um **cache inteligente**:

```
┌─────────────────────────────────────┐
│  Função: buscarDados(orgId)         │
│                                     │
│  Chamada 1: buscarDados("org-123")  │
│  → Calcula e salva: "org-123" = dados │
│                                     │
│  Chamada 2: buscarDados("org-123")  │
│  → Olha no cache: "Já tenho isso!"  │
│  → Retorna dados SEM recalcular ✅  │
│                                     │
│  Chamada 3: buscarDados("org-456")  │
│  → Não tem no cache, calcula novo  │
│  → Salva: "org-456" = novos dados   │
└─────────────────────────────────────┘
```

---

## Outros Hooks de Memoização no React

### 1. `useMemo` - Memoiza VALORES

```typescript
// ❌ SEM memoização: recalcula toda vez
const total = items.reduce((sum, item) => sum + item.price, 0);

// ✅ COM memoização: só recalcula se items mudar
const total = useMemo(() => {
  return items.reduce((sum, item) => sum + item.price, 0);
}, [items]); // Só recalcula se items mudar
```

### 2. `useCallback` - Memoiza FUNÇÕES (o que usamos)

```typescript
// ❌ SEM memoização: recria função toda vez
const handleClick = () => { console.log('click'); };

// ✅ COM memoização: só recria se dependências mudarem
const handleClick = useCallback(() => {
  console.log('click');
}, []); // Nunca recria (array vazio)
```

### 3. `React.memo` - Memoiza COMPONENTES

```typescript
// ❌ SEM memoização: re-renderiza sempre
function MeuComponente({ nome }) {
  return <div>{nome}</div>;
}

// ✅ COM memoização: só re-renderiza se props mudarem
const MeuComponente = React.memo(function MeuComponente({ nome }) {
  return <div>{nome}</div>;
});
```

---

## Resumo Visual

```
SEM Memoização:
┌─────────────┐
│ Render 1    │ → Cria função A
│ Render 2    │ → Cria função B (nova, diferente!)
│ Render 3    │ → Cria função C (nova, diferente!)
└─────────────┘
❌ 3 funções diferentes (desperdício)

COM Memoização:
┌─────────────┐
│ Render 1    │ → Cria função A e MEMORIZA
│ Render 2    │ → Usa função A (memorizada)
│ Render 3    │ → Usa função A (memorizada)
└─────────────┘
✅ 1 função reutilizada (eficiente)
```

---

## Por Que É Importante?

1. **Performance**: Evita recriar funções/valores desnecessariamente
2. **Estabilidade**: Funções têm a mesma referência entre renders
3. **Correção de Bugs**: Evita stale closures (valores antigos)
4. **Otimização**: Menos re-renders = app mais rápido

---

## Conclusão

**Memoização = "Lembrar" resultados para não recalcular**

No nosso caso:
- `useCallback` "lembra" a função `fetchMessages`
- Só recria quando `phone`, `activeOrgId` ou `toast` mudam
- Garante que sempre usa valores atualizados
- Melhora performance e corrige bugs

É como ter uma "memória" que evita trabalho repetido! 🧠✨
