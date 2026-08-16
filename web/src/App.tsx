import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, CartProvider, ToastProvider } from './lib/store';
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
import { AdminLayout } from './pages/admin/AdminLayout';
import { Dashboard } from './pages/admin/Dashboard';
import { Products } from './pages/admin/Products';
import { Orders } from './pages/admin/Orders';
import { Inventory } from './pages/admin/Inventory';
import { Settings } from './pages/admin/Settings';
import { Content } from './pages/admin/Content';

// Vite's BASE_URL is "/" on a custom domain and "/<repo>/" on project Pages.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
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
              </Route>

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<Products />} />
                <Route path="orders" element={<Orders />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="content" element={<Content />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
