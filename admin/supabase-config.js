// ==========================================
// Configuración de Supabase
// ==========================================

// Reemplaza estas credenciales con las tuyas de Supabase
// Obténlas en: https://supabase.com/dashboard > your-project > Settings > API

const SUPABASE_URL = 'https://toryoblzisspbemtehcl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0UVvh06wWLiIHg1e0msf7g_Qh9I4smr';

// ==========================================
// Tabla productos - SQL para crearla en Supabase
// ==========================================
/*
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    referencia TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    categoria TEXT,
    descripcion TEXT,
    precio numeric DEFAULT 0,
    stock integer DEFAULT 0,
    imagen TEXT,
    etiqueta TEXT,
    tallas TEXT,
    colores TEXT,
    stock_00 integer DEFAULT 0,
    stock_0 integer DEFAULT 0,
    stock_1 integer DEFAULT 0,
    stock_2 integer DEFAULT 0,
    stock_4 integer DEFAULT 0,
    stock_6 integer DEFAULT 0,
    stock_8 integer DEFAULT 0,
    stock_10 integer DEFAULT 0,
    stock_12 integer DEFAULT 0,
    precio_00 numeric DEFAULT 0,
    precio_0 numeric DEFAULT 0,
    precio_1 numeric DEFAULT 0,
    precio_2 numeric DEFAULT 0,
    precio_4 numeric DEFAULT 0,
    precio_6 numeric DEFAULT 0,
    precio_8 numeric DEFAULT 0,
    precio_10 numeric DEFAULT 0,
    precio_12 numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_00 integer DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_00 numeric DEFAULT 0;

-- Policy para lectura pública (para la tienda)
CREATE POLICY "Allow public read" ON productos
    FOR SELECT USING (true);

-- Policy para actualización solo autenticados (admin)
CREATE POLICY "Allow authenticated update" ON productos
    FOR ALL USING (auth.role() = 'authenticated');
*/

// ==========================================
// Storage - SQL para crear bucket
// ==========================================
/*
-- Crear bucket para imágenes
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true);

-- Policy para lectura pública
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'productos');

-- Policy para upload autenticado
CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'productos' AND auth.role() = 'authenticated');
*/

// ==========================================
// Funciones helper
// ==========================================

class SupabaseService {
    constructor() {
        this.url = SUPABASE_URL;
        this.key = SUPABASE_ANON_KEY;
        this.table = 'productos';
        this.bucket = 'productos';
    }

    getHeaders() {
        // Buscar si hay un token de sesión en localStorage
        const sessionToken = localStorage.getItem('supabase_session_token');
        const authHeader = sessionToken ? `Bearer ${sessionToken}` : `Bearer ${this.key}`;
        
        return {
            'Content-Type': 'application/json',
            'apikey': this.key,
            'Authorization': authHeader
        };
    }

    // Obtener todos los productos
    async getProducts() {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}?order(created_at.desc)`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            
            if (!response.ok) throw new Error('Error fetching products');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return [];
        }
    }

    // Obtener producto por ID
    async getProduct(id) {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}?id=eq.${id}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            
            const data = await response.json();
            return data[0] || null;
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }

    // Obtener producto por referencia
    async getProductByRef(referencia) {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}?referencia=eq.${encodeURIComponent(referencia)}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            
            const data = await response.json();
            return data[0] || null;
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }

    // Crear producto
    async createProduct(product) {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}`, {
                method: 'POST',
                headers: {
                    ...this.getHeaders(),
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(product)
            });
            
            if (!response.ok) throw new Error('Error creating product');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }

    // Actualizar producto
    async updateProduct(id, product) {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    ...this.getHeaders(),
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    ...product,
                    updated_at: new Date().toISOString()
                })
            });
            
            if (!response.ok) throw new Error('Error updating product');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }

    // Eliminar producto
    async deleteProduct(id) {
        try {
            const response = await fetch(`${this.url}/rest/v1/${this.table}?id=eq.${id}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            
            return response.ok;
        } catch (error) {
            console.error('Error:', error);
            return false;
        }
    }

    // Buscar productos
    async searchProducts(query) {
        try {
            const response = await fetch(
                `${this.url}/rest/v1/${this.table}?or=(nombre.ilike.*${query}*,referencia.ilike.*${query}*)`, 
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );
            
            if (!response.ok) throw new Error('Error searching products');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return [];
        }
    }

    // Filtrar por categoría
    async getByCategory(categoria) {
        try {
            const response = await fetch(
                `${this.url}/rest/v1/${this.table}?categoria=eq.${encodeURIComponent(categoria)}`, 
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );
            
            if (!response.ok) throw new Error('Error filtering products');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return [];
        }
    }

    // Subir imagen al Storage
    async uploadImage(file, reference, accessToken) {
        try {
            const fileName = `${reference}_${Date.now()}.${file.name.split('.').pop()}`;
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', fileName);
            formData.append('upsert', 'true');

            const response = await fetch(
                `${this.url}/storage/v1/object/${this.bucket}/${fileName}`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': this.key,
                        'Authorization': `Bearer ${accessToken || this.key}`
                    },
                    body: formData
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.log('Upload error:', errorText);
                throw new Error('Error uploading image');
            }
            
            // Retornar URL pública
            return `${this.url}/storage/v1/object/public/${this.bucket}/${fileName}`;
        } catch (error) {
            console.error('Error uploading:', error);
            return null;
        }
    }

    // Eliminar imagen del Storage
    async deleteImage(imageUrl) {
        try {
            if (!imageUrl) return true;
            
            // Extraer nombre del archivo de la URL
            const fileName = imageUrl.split('/').pop();
            
            const response = await fetch(
                `${this.url}/storage/v1/object/${this.bucket}/${fileName}`,
                {
                    method: 'DELETE',
                    headers: {
                        'apikey': this.key,
                        'Authorization': `Bearer ${this.key}`
                    }
                }
            );
            
            return response.ok;
        } catch (error) {
            console.error('Error deleting image:', error);
            return false;
        }
    }

    // Productos con bajo stock
    async getLowStock(threshold = 5) {
        try {
            const response = await fetch(
                `${this.url}/rest/v1/${this.table}?stock=lt.${threshold}&order(stock.asc)`,
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );
            
            if (!response.ok) throw new Error('Error fetching low stock');
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return [];
        }
    }

    // Estadísticas del inventario
    async getStats() {
        try {
            const products = await this.getProducts();
            
            const totalProducts = products.length;
            const lowStock = products.filter(p => parseInt(p.stock) < 5).length;
            const totalValue = products.reduce((sum, p) => sum + (parseFloat(p.precio || 0) * parseInt(p.stock || 0)), 0);
            const totalUnits = products.reduce((sum, p) => sum + parseInt(p.stock || 0), 0);
            
            return {
                totalProducts,
                lowStock,
                totalValue,
                totalUnits
            };
        } catch (error) {
            console.error('Error:', error);
            return {
                totalProducts: 0,
                lowStock: 0,
                totalValue: 0,
                totalUnits: 0
            };
        }
    }
    // Obtener perfil de usuario (con rol)
    async getUserProfile(userId, accessToken) {
        try {
            console.log('Fetching profile with token for user:', userId);
            const response = await fetch(
                `${this.url}/rest/v1/perfiles?id=eq.${userId}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': this.key,
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );
            
            console.log('Profile response status:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.log('Profile error response:', errorText);
                throw new Error('Error fetching profile: ' + errorText);
            }
            const data = await response.json();
            console.log('Profile data from Supabase:', data);
            return data[0] || null;
        } catch (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
    }

    // Obtener sesión actual
    async getSession() {
        try {
            const response = await fetch(
                `${this.url}/auth/v1/session`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': this.key,
                        'Authorization': `Bearer ${localStorage.getItem('supabase_session_token') || this.key}`
                    }
                }
            );
            
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }
    
    // Método RPC para ejecutar funciones de PostgreSQL
    async rpc(functionName, params = {}) {
        try {
            const response = await fetch(
                `${this.url}/rest/v1/rpc/${functionName}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': this.key,
                        'Authorization': `Bearer ${this.key}`
                    },
                    body: JSON.stringify(params)
                }
            );
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`RPC Error: ${errorText}`);
            }
            
            return { data: await response.json(), error: null };
        } catch (error) {
            console.error('RPC Error:', error);
            return { data: null, error: error };
        }
    }
    
    // Método .from() para consultas tipo Supabase
    from(tableName) {
        const self = this;
        return {
            select: async (columns = '*') => {
                try {
                    const response = await fetch(
                        `${self.url}/rest/v1/${tableName}?select=${columns}`,
                        {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': self.key,
                                'Authorization': `Bearer ${self.key}`
                            }
                        }
                    );
                    if (!response.ok) throw new Error('Error en select');
                    return { data: await response.json(), error: null };
                } catch (error) {
                    return { data: null, error: error };
                }
            },
            
            insert: async (data) => {
                try {
                    const response = await fetch(
                        `${self.url}/rest/v1/${tableName}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': self.key,
                                'Authorization': `Bearer ${self.key}`,
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify(data)
                        }
                    );
                    if (!response.ok) throw new Error('Error en insert');
                    return { data: await response.json(), error: null };
                } catch (error) {
                    return { data: null, error: error };
                }
            },
            
            update: async (data, filters = '') => {
                try {
                    const response = await fetch(
                        `${self.url}/rest/v1/${tableName}?${filters}`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': self.key,
                                'Authorization': `Bearer ${self.key}`,
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify(data)
                        }
                    );
                    if (!response.ok) throw new Error('Error en update');
                    return { data: await response.json(), error: null };
                } catch (error) {
                    return { data: null, error: error };
                }
            },
            
            delete: async (filters = '') => {
                try {
                    const response = await fetch(
                        `${self.url}/rest/v1/${tableName}?${filters}`,
                        {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': self.key,
                                'Authorization': `Bearer ${self.key}`
                            }
                        }
                    );
                    if (!response.ok) throw new Error('Error en delete');
                    return { data: await response.json(), error: null };
                } catch (error) {
                    return { data: null, error: error };
                }
            },
            
            // Método order para ordenar resultados
            order: async (column, { ascending = true } = {}) => {
                // Retorna la tabla para continuar encadenando
                return { tableName, column, ascending };
            },
            
            // Método eq para filtros
            eq: function(column, value) {
                const currentUrl = this._url || '';
                const separator = currentUrl.includes('?') ? '&' : '?';
                return {
                    select: async () => {
                        try {
                            const response = await fetch(
                                `${self.url}/rest/v1/${tableName}?${column}=eq.${value}`,
                                {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': self.key,
                                        'Authorization': `Bearer ${self.key}`
                                    }
                                }
                            );
                            if (!response.ok) throw new Error('Error en select');
                            return { data: await response.json(), error: null };
                        } catch (error) {
                            return { data: null, error: error };
                        }
                    }
                };
            }
        };
    }
}

// Instancia global
const supabase = new SupabaseService();

// Verificar configuración
function checkSupabaseConfig() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ CONFIGURACIÓN INCOMPLETA: Debes agregar tus credenciales de Supabase');
        return false;
    }
    console.log('✅ Supabase configurado correctamente');
    return true;
}

// Inicializar
checkSupabaseConfig();