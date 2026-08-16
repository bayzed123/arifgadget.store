import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setToken } from './api';
import type { AdminUser, Product } from './types';

/* ============================================================ toasts */

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ============================================================ cart */

export interface CartItem {
  product_id: number;
  qty: number;
  /** Snapshot for instant render; the server re-prices on every quote. */
  name: string;
  slug: string;
  sku: string;
  image_url: string;
  price: number;
  moq: number;
  /** Kept so the placeholder silhouette matches the product in the cart. */
  category: string | null;
}

interface CartApi {
  items: CartItem[];
  count: number;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
}

const CART_KEY = 'ag.cart.v1';
const CartCtx = createContext<CartApi>({
  items: [],
  count: 0,
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
});

export const useCart = () => useContext(CartCtx);

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === 'object' && item !== null && 'product_id' in item && 'qty' in item,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readCart);
  const toast = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* storage full or blocked — cart stays in memory */
    }
  }, [items]);

  const add = useCallback(
    (product: Product, qty?: number) => {
      const amount = Math.max(qty ?? product.moq, product.moq);
      setItems((list) => {
        const existing = list.find((i) => i.product_id === product.id);
        if (existing) {
          return list.map((i) => (i.product_id === product.id ? { ...i, qty: i.qty + amount } : i));
        }
        return [
          ...list,
          {
            product_id: product.id,
            qty: amount,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            image_url: product.image_url,
            price: product.price,
            moq: product.moq,
            category: product.category?.slug ?? null,
          },
        ];
      });
      toast(`${product.name} added to cart`, 'success');
    },
    [toast],
  );

  const setQty = useCallback((productId: number, qty: number) => {
    setItems((list) =>
      list.map((i) => (i.product_id === productId ? { ...i, qty: Math.max(qty, i.moq) } : i)),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setItems((list) => list.filter((i) => i.product_id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartApi>(
    () => ({ items, count: items.reduce((n, i) => n + i.qty, 0), add, setQty, remove, clear }),
    [items, add, setQty, remove, clear],
  );

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

/* ============================================================ admin session */

interface AuthApi {
  admin: AdminUser | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthCtx = createContext<AuthApi>({
  admin: null,
  ready: false,
  signIn: async () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  // Resume an existing session on load; a rejected token clears itself in api().
  useEffect(() => {
    let cancelled = false;
    api<{ admin: AdminUser }>('/api/admin/me', { auth: true })
      .then((res) => {
        if (!cancelled) setAdmin(res.admin);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string; admin: AdminUser }>('/api/admin/login', {
      method: 'POST',
      body: { username, password },
    });
    setToken(res.token);
    setAdmin(res.admin);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo<AuthApi>(() => ({ admin, ready, signIn, signOut }), [admin, ready, signIn, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ============================================================ theme */

type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'ag.theme';

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return [theme, setThemeState];
}
