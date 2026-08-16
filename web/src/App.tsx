import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, CartProvider, CustomerProvider, ToastProvider } from './lib/store';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Product } from './pages/Product';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { Track } from './pages/Track';
import { ContentPage } from './pages/ContentPage';
import { Blog, BlogPost } from './pages/Blog';
import { Press } from './pages/Press';
import { Account } from './pages/Account';
import { AdminLayout } from './pages/admin/AdminLayout';
import { Dashboard } from './pages/admin/Dashboard';
import { Products } from './pages/admin/Products';
import { Orders } from './pages/admin/Orders';
import { Inventory } from './pages/admin/Inventory';
import { Settings } from './pages/admin/Settings';
import { Content } from './pages/admin/Content';
import { Customers } from './pages/admin/Customers';
import { Guide } from './pages/admin/Guide';

// Vite's BASE_URL is "/" on a custom domain and "/<repo>/" on project Pages.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CustomerProvider>
          <CartProvider>
          <BrowserRouter basename={basename || undefined}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="catalog" element={<Catalog />} />
                <Route path="product/:slug" element={<Product />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="track" element={<Track />} />
                <Route path="page/:slug" element={<ContentPage />} />
                <Route path="blog" element={<Blog />} />
                <Route path="blog/:slug" element={<BlogPost />} />
                <Route path="press" element={<Press />} />
                <Route path="account" element={<Account />} />
              </Route>

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<Products />} />
                <Route path="orders" element={<Orders />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="customers" element={<Customers />} />
                <Route path="content" element={<Content />} />
                {/* The offer popup deserves its own address — it was too easy to miss as a tab. */}
                <Route path="offers" element={<Content initialTab="banners" />} />
                <Route path="guide" element={<Guide />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </CartProvider>
        </CustomerProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
