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

/* ============================================================ buy now */

const BUYNOW_KEY = 'ag.buynow.v1';

export interface DirectBuy {
  product_id: number;
  qty: number;
  name: string;
  slug: string;
  image_url: string;
  category: string | null;
}

/**
 * "Buy now" checks out a single product without disturbing the cart, so a
 * shopper mid-basket can grab one thing and come back. Session-scoped: it
 * should not survive a browser restart the way a cart does.
 */
export function setDirectBuy(item: DirectBuy | null): void {
  try {
    if (item) sessionStorage.setItem(BUYNOW_KEY, JSON.stringify(item));
    else sessionStorage.removeItem(BUYNOW_KEY);
  } catch {
    /* ignore */
  }
}

export function getDirectBuy(): DirectBuy | null {
  try {
    const raw = sessionStorage.getItem(BUYNOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DirectBuy;
    return parsed && typeof parsed.product_id === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/* ============================================================ customer session */

const CUSTOMER_TOKEN_KEY = 'ag.customer.token';

export function getCustomerToken(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCustomerToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    else localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export interface CustomerUser {
  id: number;
  phone: string;
  name: string;
  email?: string;
  address?: string;
  city?: string;
}

interface CustomerApi {
  customer: CustomerUser | null;
  ready: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  register: (input: { name: string; phone: string; password: string; email?: string }) => Promise<void>;
  signOut: () => void;
  refresh: () => void;
}

const CustomerCtx = createContext<CustomerApi>({
  customer: null,
  ready: false,
  signIn: async () => {},
  register: async () => {},
  signOut: () => {},
  refresh: () => {},
});

export const useCustomer = () => useContext(CustomerCtx);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    if (!getCustomerToken()) {
      setCustomer(null);
      setReady(true);
      return;
    }
    api<{ customer: CustomerUser }>('/api/account/me', { customerAuth: true })
      .then((res) => setCustomer(res.customer))
      .catch(() => {
        setCustomerToken(null);
        setCustomer(null);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(refresh, [refresh]);

  const signIn = useCallback(async (phone: string, password: string) => {
    const res = await api<{ token: string; customer: CustomerUser }>('/api/account/login', {
      method: 'POST',
      body: { phone, password },
    });
    setCustomerToken(res.token);
    setCustomer(res.customer);
  }, []);

  const register = useCallback(
    async (input: { name: string; phone: string; password: string; email?: string }) => {
      const res = await api<{ token: string; customer: CustomerUser }>('/api/account/register', {
        method: 'POST',
        body: input,
      });
      setCustomerToken(res.token);
      setCustomer(res.customer);
    },
    [],
  );

  const signOut = useCallback(() => {
    setCustomerToken(null);
    setCustomer(null);
  }, []);

  const value = useMemo<CustomerApi>(
    () => ({ customer, ready, signIn, register, signOut, refresh }),
    [customer, ready, signIn, register, signOut, refresh],
  );
  return <CustomerCtx.Provider value={value}>{children}</CustomerCtx.Provider>;
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
