// ==========================================
// ADMIN PANEL - Gestión de Inventario
// ==========================================

// Importar configuración de Supabase
// (Se carga antes en el HTML - incluye la instancia supabase)

// Variables de autenticación y roles
let currentUser = null;
let currentUserRole = null; // 'admin', 'operario' o 'empleado'

// Permisos del usuario
const PERMISOS = {
    admin: {
        puedeVerInventario: true,
        puedeAgregar: true,
        puedeEditar: true,
        puedeEliminar: true,
        puedeVerTodo: true,
        puedeEditarCliente: true,
        puedeEliminarCliente: true,
        puedeEliminarFactura: true
    },
    operario: {
        puedeVerInventario: true,
        puedeAgregar: true,
        puedeEditar: true,
        puedeEliminar: false,
        puedeVerTodo: true,
        puedeEditarCliente: true,
        puedeEliminarCliente: false,
        puedeEliminarFactura: false
    },
    empleado: {
        puedeVerInventario: false,
        puedeAgregar: false,
        puedeEditar: false,
        puedeEliminar: false,
        puedeVerTodo: false,
        puedeEditarCliente: false,
        puedeEliminarCliente: false,
        puedeEliminarFactura: false
    }
};

// Modo de datos: 'supabase' | 'sheets' | 'local'
let dataMode = 'supabase'; // Cambiar a 'supabase' cuando esté configurado

let productos = [];
let allProductos = [];
let editingProductId = null;
let editingProductUUID = null; // ID de Supabase

// Mapeo de columnas
const COLUMN_MAPPING = {
    'referencia': 'referencia',
    'nombre': 'nombre',
    'categoria': 'categoria',
    'categoría': 'categoria',
    'precio': 'precio',
    'stock': 'stock',
    'imagen': 'imagen',
    'descripcion': 'descripcion',
    'descripción': 'descripcion',
    'etiqueta': 'etiqueta',
    'tallas': 'tallas',
    'colores': 'colores',
    // Stock por talla
    'stock_0': 'stock_0',
    'stock_1': 'stock_1',
    'stock_2': 'stock_2',
    'stock_4': 'stock_4',
    'stock_6': 'stock_6',
    'stock_8': 'stock_8',
    'stock_10': 'stock_10',
    'stock_12': 'stock_12',
    // Precio por talla
    'precio_0': 'precio_0',
    'precio_1': 'precio_1',
    'precio_2': 'precio_2',
    'precio_4': 'precio_4',
    'precio_6': 'precio_6',
    'precio_8': 'precio_8',
    'precio_10': 'precio_10',
    'precio_12': 'precio_12'
};

// Datos de prueba
const DUMMY_PRODUCTS = [
    { referencia: 'R1', nombre: 'Vestido Rosa Ceremonial', categoria: 'Niñas', precio: '85000', stock: '5', imagen: '', descripcion: 'Hermoso vestido rosa para ceremonias', etiqueta: '', tallas: '2,4,6,8,10,12', colores: 'Rosa' },
    { referencia: 'R2', nombre: 'Traje Primera Comunión', categoria: 'Primera Comunión', precio: '125000', stock: '2', imagen: '', descripcion: 'Elegante traje', etiqueta: 'destacado', tallas: '8,10,12', colores: 'Blanco' },
    { referencia: 'R3', nombre: 'Body Bebé Azul', categoria: 'Bebes', precio: '35000', stock: '12', imagen: '', descripcion: 'Body cómodo', etiqueta: 'nuevo', tallas: '0-3M,3-6M,6-12M', colores: 'Azul' }
];

// ==========================================
// UTILIDADES - Imagenes de Supabase Storage
// ==========================================

const ADMIN_SUPABASE_STORAGE_URL = 'https://toryoblzisspbemtehcl.supabase.co/storage/v1/object/public/productos';

// Helper: Convertir nombres de archivo a URL de Supabase Storage
function formatAdminImage(url) {
    if (!url || typeof url !== 'string') return 'https://placehold.co/50x50/f3f3f3/a1a1a1?text=Sin+Imagen';

    const cleanUrl = url.trim();

    // Si ya es un link completo (http...), devolverlo directamente
    if (cleanUrl.startsWith('http')) {
        return cleanUrl;
    }

    // Si es solo un nombre de archivo, construir URL de Supabase Storage
    return `${ADMIN_SUPABASE_STORAGE_URL}/${cleanUrl}`;
}

// ==========================================
// UTILIDADES
// ==========================================

function showToast(message, type) {
    type = type || 'success';
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(function () { toast.classList.remove('show'); }, 3000);
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('muminita_products', JSON.stringify(productos));
    } catch (e) {
        console.error('Error guardando:', e);
    }
}

function loadFromLocalStorage() {
    try {
        var saved = localStorage.getItem('muminita_products');
        if (saved) {
            productos = JSON.parse(saved);
            allProductos = productos.slice();
            return true;
        } else {
            productos = DUMMY_PRODUCTS.slice();
            allProductos = productos.slice();
            saveToLocalStorage();
            return true;
        }
    } catch (e) {
        productos = DUMMY_PRODUCTS.slice();
        allProductos = productos.slice();
        return true;
    }
}

// ==========================================
// CSV PARSER
// ==========================================

function csvToObjects(csv) {
    var lines = csv.trim().split('\n');
    if (lines.length < 2) return [];

    // Parse headers
    var headers = lines[0].split(',').map(function (h) {
        return h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    });

    var data = [];
    for (var i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        var values = parseCSVLine(lines[i]);
        if (values.length < headers.length) continue;

        var obj = {};
        headers.forEach(function (header, idx) {
            var mappedKey = COLUMN_MAPPING[header] || header;
            obj[mappedKey] = values[idx] || '';
        });
        data.push(obj);
    }

    return data;
}

function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
        var char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function objectsToCsv(objects) {
    if (objects.length === 0) return '';

    // Todos los encabezados que espera la importación
    var headers = [
        'Referencia', 'Nombre', 'Categoria', 'Tallas', 'Colores',
        'Descripcion', 'Precio', 'Stock',
        'Stock_0', 'Stock_1', 'Stock_2', 'Stock_4', 'Stock_6', 'Stock_8', 'Stock_10', 'Stock_12',
        'Precio_0', 'Precio_1', 'Precio_2', 'Precio_4', 'Precio_6', 'Precio_8', 'Precio_10', 'Precio_12',
        'Imagen', 'Etiqueta'
    ];

    var csv = headers.join(',') + '\n';

    objects.forEach(function (obj) {
        var row = headers.map(function (header) {
            var key = header.toLowerCase();
            var value = obj[key] || '';
            // Convertir a string
            value = String(value);
            // Escapar comas y comillas
            if (value.indexOf(',') > -1 || value.indexOf('"') > -1 || value.indexOf('\n') > -1) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });
    return csv;
}

// ==========================================
// FETCH INVENTORY
// ==========================================

async function fetchInventory() {
    // Si está configurado Supabase, usarlo primero
    if (dataMode === 'supabase' && typeof supabase !== 'undefined') {
        try {
            var supabaseProducts = await supabase.getProducts();
            if (supabaseProducts && supabaseProducts.length > 0) {
                allProductos = supabaseProducts;
                productos = allProductos.slice();
                updateDashboard();
                renderTable();
                showToast('Inventario cargado desde Supabase (' + supabaseProducts.length + ' productos)', 'success');
                return true;
            }
        } catch (e) {
            console.error('Error fetching from Supabase:', e);
            showToast('Error conectando a Supabase', 'warning');
        }
    }

    // Intentar Google Sheets


    // Usar datos locales como fallback
    loadFromLocalStorage();
    updateDashboard();
    renderTable();
    showToast('Usando datos locales', 'warning');
    return false;
}

// ==========================================
// AUTENTICACIÓN CON SUPABASE
// ==========================================

// Función para iniciar sesión con Supabase Auth
async function signIn(email, password) {
    try {
        console.log('Iniciando sesión con:', email);
        console.log('SUPABASE_URL:', SUPABASE_URL);
        console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'definida' : 'undefined');

        const response = await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ email, password })
            }
        );

        console.log('Response status:', response.status);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.log('Error response:', error);
            throw new Error(error.msg || error.error_description || error.message || 'Error al iniciar sesión');
        }

        const data = await response.json();
        console.log('Login exitoso, data:', data);

        // Guardar el token
        localStorage.setItem('supabase_session_token', data.access_token);

        // Obtener perfil del usuario
        console.log('Obteniendo perfil para:', data.user.id);
        let profile = await supabase.getUserProfile(data.user.id, data.access_token);
        console.log('Profile obtenido:', profile);
        console.log('Rol del perfil:', profile?.rol);

        // Si no tiene perfil, crear uno automáticamente como operario
        if (!profile) {
            console.log('Creando perfil automáticamente para:', data.user.email);
            profile = {
                id: data.user.id,
                email: data.user.email,
                rol: 'operario', // Por defecto operario
                activo: true
            };

            // Intentar guardar en Supabase (opcional, si falla igual funciona)
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/perfiles`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${data.access_token}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        id: data.user.id,
                        email: data.user.email,
                        nombre: data.user.email,
                        rol: 'operario',
                        activo: true
                    })
                });
            } catch (e) {
                console.log('No se pudo crear perfil en Supabase, usando modo local');
            }
        }

        if (!profile.activo) {
            throw new Error('Usuario inactivo. Contacta al administrador.');
        }

        currentUser = data.user;
        currentUserRole = profile.rol;

        return { success: true, user: data.user, rol: profile.rol };
    } catch (error) {
        console.error('Error en signIn:', error);
        return { success: false, error: error.message };
    }
}

// Función para cerrar sesión
async function signOut() {
    try {
        const token = localStorage.getItem('supabase_session_token');
        if (token) {
            await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        localStorage.removeItem('supabase_session_token');
        currentUser = null;
        currentUserRole = null;
        return true;
    } catch (error) {
        console.error('Error en signOut:', error);
        return false;
    }
}

// Verificar si el usuario tiene permiso para una acción
function hasPermission(action) {
    if (!currentUserRole) return false;
    return PERMISOS[currentUserRole]?.[action] || false;
}

// Mostrar/ocultar elementos según el rol
function updateUIBasedOnRole() {
    const puedeVerInventario = hasPermission('puedeVerInventario');

    // Actualizar información del usuario en el header
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.innerHTML = `<span class="user-role">${currentUser?.email} (${currentUserRole})</span>`;
    }

    // Elementos exclusivos de inventario / administración
    const dashboardStats = document.querySelector('.dashboard-stats');
    const controlsRight = document.querySelector('.controls-right');
    const inventarioIds = ['ley1581Btn', 'addProductBtn', 'searchInput', 'categoryFilter'];
    const headerTitle = document.querySelector('.admin-header h1');

    if (!puedeVerInventario) {
        if (dashboardStats) dashboardStats.style.display = 'none';
        if (controlsRight) controlsRight.style.display = 'none';
        inventarioIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.getElementById('tableView')?.classList.add('hidden');
        document.getElementById('gridView')?.classList.add('hidden');
        if (headerTitle) {
            headerTitle.innerHTML = '<i class="fas fa-cash-register"></i> MumiNita - Facturación';
        }
    } else {
        if (dashboardStats) dashboardStats.style.display = '';
        if (controlsRight) controlsRight.style.display = '';
        inventarioIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        if (headerTitle) {
            headerTitle.innerHTML = '<i class="fas fa-box"></i> Inventario MumiNita';
        }
    }
}

// Event listener del formulario de login
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginError = document.getElementById('loginError');

    if (!email || !password) {
        loginError.textContent = 'Por favor ingresa email y contraseña';
        loginError.classList.remove('hidden');
        return;
    }

    loginError.classList.add('hidden');
    loginError.textContent = '';

    // Mostrar mensaje de carga
    loginError.textContent = 'Verificando...';
    loginError.classList.remove('hidden');

    try {
        const result = await signIn(email, password);
        console.log('Resultado:', result);

        if (result.success) {
            showToast('¡Bienvenido! ' + result.user.email + ' (' + result.rol + ')', 'success');

            // Ocultar login
            const loginModal = document.getElementById('loginModal');
            loginModal.style.display = 'none';

            // Mostrar admin
            const adminPanel = document.getElementById('adminPanel');
            adminPanel.classList.remove('hidden');
            adminPanel.style.display = 'block';

            // Actualizar UI según el rol
            updateUIBasedOnRole();

            // Cargar productos (en memoria para facturar y en tabla si tiene permiso)
            fetchInventory().then(function (success) {
                if (!success) {
                    loadFromLocalStorage();
                }
                if (hasPermission('puedeVerInventario')) {
                    updateDashboard();
                    renderTable();
                } else {
                    currentView = 'inventory';
                    switchSection('billing');
                }
            });
        } else {
            loginError.textContent = result.error || 'Error desconocido';
            loginError.classList.remove('hidden');
        }
    } catch (err) {
        console.error(err);
        loginError.textContent = 'Error: ' + err.message;
        loginError.classList.remove('hidden');
    }
});

// Restaurar sesión activa automáticamente si existe token
async function verificarSesionExistente() {
    const token = localStorage.getItem('supabase_session_token');
    if (!token) return;

    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;

            let profile = await supabase.getUserProfile(userData.id, token);
            currentUserRole = profile?.rol || 'operario';

            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.style.display = 'none';
                loginModal.classList.remove('active');
            }

            const adminPanel = document.getElementById('adminPanel');
            if (adminPanel) {
                adminPanel.classList.remove('hidden');
                adminPanel.style.display = 'block';
            }

            updateUIBasedOnRole();
            await fetchInventory();
            if (!hasPermission('puedeVerInventario')) {
                currentView = 'inventory';
                switchSection('billing');
            }
        } else {
            localStorage.removeItem('supabase_session_token');
        }
    } catch (e) {
        console.warn('Sesión no recuperada:', e);
    }
}

// Comprobar sesión al cargar
document.addEventListener('DOMContentLoaded', verificarSesionExistente);

// Event listener del botón de logout
document.getElementById('logoutBtn').addEventListener('click', async function () {
    await signOut();

    // Mostrar login
    const loginModal = document.getElementById('loginModal');
    loginModal.classList.add('active');
    loginModal.classList.remove('hidden');
    loginModal.style.display = 'flex';

    // Ocultar admin
    const adminPanel = document.getElementById('adminPanel');
    adminPanel.classList.add('hidden');
    adminPanel.style.display = 'none';

    // Limpiar campos
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('loginError').classList.add('hidden');
});

// ==========================================
// DASHBOARD
// ==========================================

function updateDashboard() {
    var totalProducts = productos.length;
    var lowStock = 0;
    var totalValue = 0;
    var totalUnits = 0;

    productos.forEach(function (p) {
        var pTotalStock = 0;
        var hasSizeStock = false;
        Object.keys(p).forEach(function (key) {
            if (key.startsWith('stock_') && p[key] !== null && p[key] !== '') {
                var s = parseInt(p[key]);
                if (!isNaN(s)) {
                    pTotalStock += s;
                    hasSizeStock = true;
                }
            }
        });
        if (!hasSizeStock) {
            pTotalStock = parseInt(p.stock || 0);
        }

        if (pTotalStock < 5) lowStock++;
        totalUnits += pTotalStock;
        totalValue += (parseFloat(p.precio || 0) * pTotalStock);
    });

    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('lowStockCount').textContent = lowStock;
    document.getElementById('totalValue').textContent = '$' + totalValue.toLocaleString('es-CO');
    document.getElementById('totalUnits').textContent = totalUnits;
}

// ==========================================
// RENDER TABLE
// ==========================================

function renderTable() {
    var tbody = document.getElementById('productsTableBody');

    if (productos.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="9" class="text-center">No hay productos</td></tr>';
        return;
    }

    var html = '';
    productos.forEach(function (product) {
        var productoId = product.referencia;
        var productoNombre = product.nombre || '-';
        var productoCategoria = product.categoria || '-';
        var productoPrecio = parseFloat(product.precio || 0).toLocaleString('es-CO');

        var totalStock = 0;
        var hasSizeStock = false;
        Object.keys(product).forEach(function (key) {
            if (key.startsWith('stock_') && product[key] !== null && product[key] !== '') {
                var s = parseInt(product[key]);
                if (!isNaN(s)) {
                    totalStock += s;
                    hasSizeStock = true;
                }
            }
        });
        if (!hasSizeStock) {
            totalStock = parseInt(product.stock || 0);
        }

        var productoStock = totalStock.toString();
        var stockClass = totalStock < 5 ? 'low' : 'ok';
        var productoImagen = product.imagen ?
            '<img src="' + formatAdminImage(product.imagen) + '" alt="' + product.nombre + '" class="thumbnail">' :
            '<em>Sin imagen</em>';
        var productoDesc = (product.descripcion || '-').substring(0, 50) + '...';
        var productoEtiqueta = product.etiqueta || '-';

        html += '<tr class="product-row" data-id="' + productoId + '">';
        html += '<td>' + productoId + '</td>';
        html += '<td><strong>' + productoNombre + '</strong></td>';
        html += '<td><span class="badge">' + productoCategoria + '</span></td>';
        html += '<td>$' + productoPrecio + '</td>';
        html += '<td><span class="stock-badge ' + stockClass + '">' + productoStock + '</span></td>';
        html += '<td>' + productoImagen + '</td>';
        html += '<td><span class="description-preview">' + productoDesc + '</span></td>';
        html += '<td><span class="badge">' + productoEtiqueta + '</span></td>';
        html += '<td class="actions">';
        html += '<button type="button" class="btn-edit" onclick="editProduct(\'' + productoId + '\')"><i class="fas fa-edit"></i></button>';
        html += '<button type="button" class="btn-delete" onclick="deleteProduct(\'' + productoId + '\')"><i class="fas fa-trash"></i></button>';
        html += '</td></tr>';
    });

    tbody.innerHTML = html;
}

// ==========================================
// MODAL
// ==========================================

var productModal = document.getElementById('productModal');
var productForm = document.getElementById('productForm');

function closeProductModal() {
    productModal.classList.add('hidden');
    productModal.classList.remove('active');
    productForm.reset();
    editingProductId = null;
}

function openProductModal() {
    document.getElementById('modalTitle').textContent = 'Nuevo Producto';
    editingProductId = null;
    productForm.reset();
    productModal.classList.remove('hidden');
    productModal.classList.add('active');
}

document.getElementById('closeModal').addEventListener('click', closeProductModal);
document.getElementById('cancelBtn').addEventListener('click', closeProductModal);

productModal.addEventListener('click', function (e) {
    if (e.target === productModal) closeProductModal();
});

document.getElementById('addProductBtn').addEventListener('click', openProductModal);

productForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    var referencia = document.getElementById('productReference').value.trim();
    var name = document.getElementById('productName').value.trim();
    var category = document.getElementById('productCategory').value;
    var price = document.getElementById('productPrice').value;
    var stock = document.getElementById('productStock').value;
    var imageFile = document.getElementById('productImageFile').files[0];
    var image = document.getElementById('productImage').value.trim();

    // Si hay un archivo seleccionado, subirlo a Supabase Storage
    if (imageFile) {
        showToast('Subiendo imagen...', 'info');
        var token = localStorage.getItem('supabase_session_token');
        var imageUrl = await supabase.uploadImage(imageFile, referencia, token);
        if (imageUrl) {
            image = imageUrl;
            showToast('Imagen subida correctamente', 'success');
        } else {
            showToast('Error al subir imagen, usando URL manual', 'error');
        }
    }
    var description = document.getElementById('productDescription').value.trim();
    var etiqueta = document.getElementById('productEtiqueta').value;
    var tallas = document.getElementById('productTallas').value.trim();
    var colores = document.getElementById('productColores').value.trim();

    // Stock por talla (todas las tallas 00-12)
    var stockTalla = {};
    const tallasArray = ['00', '0', '1', '2', '4', '6', '8', '10', '12'];
    for (var i = 0; i < tallasArray.length; i++) {
        var valStock = document.getElementById('stock_' + tallasArray[i]);
        if (valStock) stockTalla['stock_' + tallasArray[i]] = parseInt(valStock.value) || 0;
    }

    // Precio por talla (todas las tallas 00-12)
    var precioTalla = {};
    for (var i = 0; i < tallasArray.length; i++) {
        var valPrecio = document.getElementById('precio_' + tallasArray[i]);
        if (valPrecio) precioTalla['precio_' + tallasArray[i]] = parseFloat(valPrecio.value) || 0;
    }

    if (!referencia || !name || !category || !price || stock === '') {
        showToast('Completa todos los campos requeridos', 'error');
        return;
    }

    var productData = {
        referencia: referencia,
        nombre: name,
        categoria: category,
        precio: parseFloat(price),
        stock: parseInt(stock),
        imagen: image,
        descripcion: description,
        etiqueta: etiqueta,
        tallas: tallas,
        colores: colores,
        ...stockTalla,
        ...precioTalla
    };

    // Usar Supabase si está configurado
    if (dataMode === 'supabase' && typeof supabase !== 'undefined') {
        try {
            console.log('Intentando guardar en Supabase...', { editingProductId, editingProductUUID });

            if (editingProductId && editingProductUUID) {
                // Actualizar en Supabase
                const result = await supabase.updateProduct(editingProductUUID, productData);
                if (result) {
                    showToast('Producto actualizado en Supabase', 'success');
                } else {
                    throw new Error('La actualización en Supabase no devolvió resultados (posible error de permisos o ID inválido)');
                }
            } else {
                // Verificar si existe por referencia antes de crear
                var existe = await supabase.getProductByRef(referencia);
                if (existe) {
                    showToast('Ya existe un producto con esta referencia. Si intentabas editarlo, asegúrate de que el ID sea correcto.', 'error');
                    console.warn('Conflicto de referencia:', referencia, 'ID existente:', existe.id);
                    return;
                }
                // Crear en Supabase
                await supabase.createProduct(productData);
                showToast('Producto creado en Supabase', 'success');
            }
            // Recargar inventario para tener los IDs frescos
            await fetchInventory();
            closeProductModal();
            return;
        } catch (err) {
            console.error('Error Crítico en Supabase:', err);
            showToast('Error de conexión con la base de datos: ' + (err.message || 'Desconocido'), 'error');
            // Intentar guardado local como respaldo
        }
    }

    // Modo local / Google Sheets
    if (editingProductId) {
        var product = productos.find(function (p) { return p.referencia === editingProductId; });
        if (product) {
            Object.assign(product, productData);
            showToast('Producto actualizado', 'success');
        }
    } else {
        var existe = productos.find(function (p) { return p.referencia === referencia; });
        if (existe) {
            showToast('Ya existe un producto con esta referencia', 'error');
            return;
        }
        productos.push(productData);
        showToast('Producto creado correctamente', 'success');
    }

    saveToLocalStorage();
    allProductos = productos.slice();
    updateDashboard();
    renderTable();
    closeProductModal();
});

// ==========================================
// EDIT/DELETE
// ==========================================

function editProduct(id) {
    console.log('Edit product:', id);
    try {
        var product = productos.find(function (p) {
            return String(p.referencia) === String(id);
        });
        if (!product) {
            console.error('Producto no encontrado:', id);
            console.log('Productos disponibles:', productos);
            return;
        }

        document.getElementById('modalTitle').textContent = 'Editar Producto';
        document.getElementById('productReference').value = product.referencia || '';
        document.getElementById('productName').value = product.nombre || '';
        document.getElementById('productCategory').value = product.categoria || '';
        document.getElementById('productPrice').value = product.precio || '';
        document.getElementById('productStock').value = product.stock || '';
        document.getElementById('productImage').value = product.imagen || '';
        document.getElementById('productDescription').value = product.descripcion || '';
        document.getElementById('productEtiqueta').value = product.etiqueta || '';
        document.getElementById('productTallas').value = product.tallas || '';
        document.getElementById('productColores').value = product.colores || '';

        // Stock por talla (todas las tallas 00-12)
        var tallas = ['00', '0', '1', '2', '4', '6', '8', '10', '12'];
        for (var i = 0; i < tallas.length; i++) {
            var el = document.getElementById('stock_' + tallas[i]);
            if (el) el.value = product['stock_' + tallas[i]] || 0;
        }

        // Precio por talla (todas las tallas 00-12)
        for (var i = 0; i < tallas.length; i++) {
            var el = document.getElementById('precio_' + tallas[i]);
            if (el) el.value = product['precio_' + tallas[i]] || 0;
        }

        editingProductId = id;
        editingProductUUID = product.id || null; // UUID de Supabase (si existe)
        productModal.classList.remove('hidden');
        productModal.classList.add('active');
    } catch (e) {
        console.error('Error en editProduct:', e);
        alert('Error al editar: ' + e.message);
    }
}

async function deleteProduct(id) {
    // Verificar permiso de eliminación
    if (!hasPermission('puedeEliminar')) {
        showToast('No tienes permiso para eliminar productos. Contacta al administrador.', 'error');
        return;
    }

    if (!confirm('¿Eliminar este producto?')) return;

    var product = productos.find(function (p) { return p.referencia === id; });

    // Usar Supabase si está configurado
    if (dataMode === 'supabase' && typeof supabase !== 'undefined' && product && product.id) {
        try {
            await supabase.deleteProduct(product.id);
            showToast('Producto eliminado de Supabase', 'success');
        } catch (err) {
            console.error('Error deleting from Supabase:', err);
            showToast('Error al eliminar de Supabase', 'error');
            return;
        }
    }

    productos = productos.filter(function (p) { return p.referencia !== id; });
    saveToLocalStorage();
    allProductos = productos.slice();
    updateDashboard();
    renderTable();
    showToast('Producto eliminado', 'success');
}

// ==========================================
// SEARCH & FILTER
// ==========================================

document.getElementById('searchInput').addEventListener('input', function (e) {
    var search = e.target.value.toLowerCase();
    productos = allProductos.filter(function (p) {
        return (p.referencia || '').toLowerCase().indexOf(search) > -1 ||
            (p.nombre || '').toLowerCase().indexOf(search) > -1 ||
            (p.descripcion || '').toLowerCase().indexOf(search) > -1;
    });
    renderTable();
    if (currentView === 'grid') renderGrid();
});

document.getElementById('categoryFilter').addEventListener('change', function (e) {
    var category = e.target.value;
    productos = category ? allProductos.filter(function (p) { return p.categoria === category; }) : allProductos.slice();
    renderTable();
    if (currentView === 'grid') renderGrid();
});

// ==========================================
// IMPORT/EXPORT
// ==========================================

document.getElementById('exportBtn').addEventListener('click', function () {
    var csv = objectsToCsv(productos);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'inventario_muminita_' + new Date().toISOString().split('T')[0] + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV descargado', 'success');
});

document.getElementById('importBtn').addEventListener('click', function () {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (event) {
        try {
            var csv = event.target.result;
            var imported = csvToObjects(csv);

            if (imported.length > 0) {
                productos = imported;
                allProductos = productos.slice();
                saveToLocalStorage();
                updateDashboard();
                renderTable();
                showToast(imported.length + ' productos importados', 'success');
            } else {
                showToast('CSV vacío o formato inválido', 'error');
            }
        } catch (err) {
            console.error('Error:', err);
            showToast('Error al importar CSV', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// ==========================================
// SYNC
// ==========================================

// ==========================================
// VISTAS
// ==========================================

var currentView = 'table';

function setView(view) {
    currentView = view;
    var tableView = document.getElementById('tableView');
    var gridView = document.getElementById('gridView');
    var tableBtn = document.getElementById('tableViewBtn');
    var gridBtn = document.getElementById('gridViewBtn');

    if (view === 'table') {
        tableView.classList.remove('hidden');
        gridView.classList.add('hidden');
        tableBtn.classList.add('active');
        gridBtn.classList.remove('active');
    } else {
        tableView.classList.add('hidden');
        gridView.classList.remove('hidden');
        tableBtn.classList.remove('active');
        gridBtn.classList.add('active');
        renderGrid();
    }
}

function renderGrid() {
    var grid = document.getElementById('productsGrid');

    if (productos.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>No hay productos</p></div>';
        return;
    }

    var html = '';
    productos.forEach(function (product) {
        var productId = product.referencia;

        var imagenHtml = product.imagen ?
            '<img src="' + formatAdminImage(product.imagen) + '" alt="' + product.nombre + '" >' :
            '<div class="no-image"><i class="fas fa-image"></i></div>';

        var etiquetaHtml = product.etiqueta ?
            '<span class="card-badge badge-' + product.etiqueta + '">' + product.etiqueta + '</span>' : '';

        html += '<div class="product-card" data-id="' + productId + '">';
        html += '<div class="card-image">' + imagenHtml + etiquetaHtml + '</div>';
        html += '<div class="card-content">';
        html += '<h3 class="card-title">' + (product.nombre || 'Sin nombre') + '</h3>';
        html += '<p class="card-ref">Ref: ' + (product.referencia || '-') + '</p>';
        html += '<p class="card-category"><span class="badge">' + (product.categoria || '-') + '</span></p>';
        html += '<p class="card-price">$' + parseFloat(product.precio || 0).toLocaleString('es-CO') + '</p>';

        var totalStock = 0;
        var hasSizeStock = false;
        Object.keys(product).forEach(function (key) {
            if (key.startsWith('stock_') && product[key] !== null && product[key] !== '') {
                var s = parseInt(product[key]);
                if (!isNaN(s)) {
                    totalStock += s;
                    hasSizeStock = true;
                }
            }
        });
        if (!hasSizeStock) {
            totalStock = parseInt(product.stock || 0);
        }

        var stockClass = totalStock < 5 ? 'low-stock' : '';
        var alertHtml = totalStock < 5 ? '<i class="fas fa-exclamation-triangle"></i>' : '';
        html += '<p class="card-stock ' + stockClass + '"><i class="fas fa-box"></i> Stock: ' + totalStock + alertHtml + '</p>';

        html += '<p class="card-tallas"><i class="fas fa-ruler"></i> ' + (product.tallas || '-') + '</p>';
        html += '<p class="card-colores"><i class="fas fa-palette"></i> ' + (product.colores || '-') + '</p>';
        html += '<p class="card-description">' + (product.descripcion || '').substring(0, 80) + '...</p>';
        html += '</div>';
        html += '<div class="card-actions">';
        html += '<button type="button" class="btn-edit" onclick="editProduct(\'' + productId + '\')"><i class="fas fa-edit"></i> Editar</button>';
        html += '<button type="button" class="btn-delete" onclick="deleteProduct(\'' + productId + '\')"><i class="fas fa-trash"></i> Eliminar</button>';
        html += '</div>';
        html += '</div>';
    });

    grid.innerHTML = html;
}

document.getElementById('tableViewBtn').addEventListener('click', function () { setView('table'); });
document.getElementById('gridViewBtn').addEventListener('click', function () { setView('grid'); });

// ==========================================
// MÓDULO DE FACTURACIÓN
// ==========================================

// Variables del módulo de facturación
let invoiceItems = [];
currentView = 'inventory'; // 'inventory' | 'billing' | 'clients' | 'legal'

// Función unificada y segura para alternar secciones sin superposiciones
function switchSection(targetSection) {
    const billingSection = document.getElementById('billingSection');
    const clientesSeccion = document.getElementById('clientesSeccion');
    const secLegalWrapper = document.getElementById('secLegalWrapper');
    const tableView = document.getElementById('tableView');
    const gridView = document.getElementById('gridView');
    const puedeVerInventario = hasPermission('puedeVerInventario');

    // Si es empleado (sin acceso a inventario), solo puede navegar entre billing y clients
    let nextSection;
    if (!puedeVerInventario) {
        if (targetSection === 'clients') {
            nextSection = (currentView === 'clients') ? 'billing' : 'clients';
        } else {
            nextSection = 'billing';
        }
    } else {
        // Toggle: si ya está abierta, volver a inventario
        nextSection = (currentView === targetSection) ? 'inventory' : targetSection;
    }
    currentView = nextSection;

    // Ocultar todas las secciones primero
    billingSection?.classList.add('hidden');
    clientesSeccion?.classList.add('hidden');
    secLegalWrapper?.classList.add('hidden');
    tableView?.classList.add('hidden');
    gridView?.classList.add('hidden');

    if (nextSection === 'billing') {
        billingSection?.classList.remove('hidden');
        loadProductSelector();
        setupHybridProductSelector();
        loadInvoiceHistory();
        setupClientSearch();
    } else if (nextSection === 'clients') {
        clientesSeccion?.classList.remove('hidden');
        if (typeof cargarClientes === 'function') cargarClientes();
    } else if (nextSection === 'legal' && puedeVerInventario) {
        secLegalWrapper?.classList.remove('hidden');
        if (typeof loadLegalConsents === 'function') loadLegalConsents();
    } else if (puedeVerInventario) {
        // Inventario
        currentView = 'inventory';
        if (typeof currentTableView !== 'undefined' && currentTableView === 'grid') {
            gridView?.classList.remove('hidden');
        } else {
            tableView?.classList.remove('hidden');
        }
    }
}

// Event Listeners de las secciones
document.getElementById('billingBtn')?.addEventListener('click', function () {
    switchSection('billing');
});

document.getElementById('clientesBtn')?.addEventListener('click', function () {
    switchSection('clients');
});

document.getElementById('ley1581Btn')?.addEventListener('click', function () {
    switchSection('legal');
});

// ==========================================
// BÚSQUEDA DE CLIENTES - Sistema Dual (Identificación, Nombre, Teléfono)
// ==========================================

// Buscar cliente por identificación (para autocompletar al digitar)
async function searchClientById(identificacion) {
    try {
        const { data, error } = await supabase.rpc('buscar_cliente', {
            p_identificacion: identificacion
        });

        if (error) throw error;

        if (data?.encontrado && data.cliente) {
            return { found: true, client: data.cliente };
        }
        return { found: false };
    } catch (err) {
        console.error('Error buscando cliente:', err);
        return { found: false, error: err };
    }
}

// Buscar clientes por texto (identificación, nombre o teléfono)
async function searchClients(texto) {
    try {
        const { data, error } = await supabase.rpc('buscar_clientes', {
            p_texto: texto
        });

        if (error) throw error;

        // Ahora data es un array directo, no un objeto con clientes
        return { success: true, clients: data || [] };
    } catch (err) {
        console.error('Error buscando clientes:', err);
        return { success: false, clients: [] };
    }
}

// Configurar búsqueda de clientes en el formulario de facturación
let clientSearchSetup = false;
let currentClientSearchResults = [];

window.selectClientByIndex = function(index) {
    const client = currentClientSearchResults[index];
    if (client) {
        selectClient(client.id, client.nombre, client.identificacion, client.telefono || '', client.email || '');
    }
};

function setupClientSearch() {
    if (clientSearchSetup) return;
    clientSearchSetup = true;

    const searchInput = document.getElementById('clientSearchInput');
    const searchBtn = document.getElementById('searchClientBtn');
    const resultsContainer = document.getElementById('clientSearchResults');
    const newClientBtn = document.getElementById('newClientBtn');

    const clientNameInput = document.getElementById('invoiceClientName');
    const idTypeSelect = document.getElementById('invoiceIdType');
    const idNumberInput = document.getElementById('invoiceIdNumber');
    const clientEmailInput = document.getElementById('invoiceEmail');
    const clientPhoneInput = document.getElementById('invoicePhone');

    if (!searchInput || !searchBtn) return;

    // Función para mostrar resultados
    function showResults(clients) {
        if (!resultsContainer) return;

        currentClientSearchResults = clients || [];

        if (!clients || clients.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No se encontraron clientes</div>';
            resultsContainer.style.display = 'block';
            return;
        }

        let html = '';
        clients.forEach((client, idx) => {
            html += `
                <div class="client-result-item" onclick="selectClientByIndex(${idx})">
                    <div class="client-result-name">${escapeHtml(client.nombre)}</div>
                    <div class="client-result-details">
                        <span><i class="fas fa-id-card"></i> ${escapeHtml(client.identificacion)}</span>
                        ${client.telefono ? `<span><i class="fas fa-phone"></i> ${escapeHtml(client.telefono)}</span>` : ''}
                    </div>
                </div>
            `;
        });

        resultsContainer.innerHTML = html;
        resultsContainer.style.display = 'block';
    }

    // Función para realizar búsqueda
    async function performSearch() {
        const searchText = searchInput.value.trim();

        if (searchText.length < 1) {
            if (resultsContainer) {
                resultsContainer.style.display = 'none';
            }
            return;
        }

        const result = await searchClients(searchText);
        if (result.success) {
            showResults(result.clients);
        }
    }

    // Evento: clic en botón de búsqueda
    searchBtn.addEventListener('click', performSearch);

    // Evento: presionar Enter en el campo de búsqueda
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });

    // Evento: búsqueda en tiempo real con debounce (después de 300ms de no escribir)
    let debounceTimer;
    searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performSearch, 300);
    });

    // Cerrar resultados al hacer clic fuera
    document.addEventListener('click', function (e) {
        if (resultsContainer && !resultsContainer.contains(e.target) && e.target !== searchInput) {
            resultsContainer.style.display = 'none';
        }
    });

    // Evento:Buscar cliente por identificación (al perder foco del campo ID)
    if (idNumberInput) {
        idNumberInput.addEventListener('blur', async function () {
            const tipoId = idTypeSelect?.value;
            const numeroId = this.value;

            if (!tipoId || !numeroId) return;

            const identificacion = `${tipoId} ${numeroId}`;
            const result = await searchClientById(identificacion);

            if (result.found && result.client) {
                // Autocompletar datos del cliente
                clientNameInput.value = result.client.nombre || '';
                clientEmailInput.value = result.client.email || '';
                clientPhoneInput.value = result.client.telefono || '';
                showToast('Cliente encontrado', 'success');
            }
        });
    }

    // Evento: Nuevo cliente - enfocar en el formulario
    if (newClientBtn) {
        newClientBtn.addEventListener('click', function () {
            // Enfocar en el campo de nombre
            clientNameInput.focus();
            showToast('Complete los datos del nuevo cliente', 'info');
        });
    }
}

// Función global para seleccionar cliente (llamada desde el dropdown)
window.selectClient = function (id, nombre, identificacion, telefono, email) {
    const clientNameInput = document.getElementById('invoiceClientName');
    const idTypeSelect = document.getElementById('invoiceIdType');
    const idNumberInput = document.getElementById('invoiceIdNumber');
    const clientEmailInput = document.getElementById('invoiceEmail');
    const clientPhoneInput = document.getElementById('invoicePhone');
    const resultsContainer = document.getElementById('clientSearchResults');

    // Autocompletar campos
    if (clientNameInput) clientNameInput.value = nombre;
    if (clientEmailInput) clientEmailInput.value = email;
    if (clientPhoneInput) clientPhoneInput.value = telefono;

    // Extraer tipo y número de identificación
    if (identificacion) {
        const parts = identificacion.split(' ');
        if (parts.length >= 2) {
            if (idTypeSelect) idTypeSelect.value = parts[0];
            if (idNumberInput) idNumberInput.value = parts.slice(1).join(' ');
        } else {
            if (idNumberInput) idNumberInput.value = identificacion;
        }
    }

    // Ocultar resultados
    if (resultsContainer) resultsContainer.style.display = 'none';

    showToast('Cliente seleccionado', 'success');
};

// Función para escapar HTML (seguridad)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Cargar productos en el selector de facturación
function loadProductSelector() {
    const selector = document.getElementById('productSelector');
    const categorySelector = document.getElementById('categorySelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">Seleccionar producto...</option>';

    // Cargar categorías únicas
    if (categorySelector) {
        const categorias = [...new Set(productos.map(p => p.categoria || p.Categoria || 'sin categoría'))];
        categorySelector.innerHTML = '<option value="">Todas las categorías</option>';
        categorias.sort().forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
            categorySelector.appendChild(option);
        });
    }

    // Cargar todos los productos en el selector
    productos.forEach(p => {
        const option = document.createElement('option');
        option.value = p.referencia;
        option.textContent = `${p.nombre} - ${parseInt(p.precio).toLocaleString('es-CO')}`;
        option.dataset.categoria = p.categoria || p.Categoria || 'sin categoría';
        option.dataset.tallas = p.tallas || '';
        option.dataset.precio = p.precio || 0;
        // Guardar precios por talla
        const preciosTalla = {};
        ['0', '1', '2', '4', '6', '8', '10', '12'].forEach(t => {
            if (p['precio_' + t]) preciosTalla[t] = p['precio_' + t];
        });
        option.dataset.preciosTalla = JSON.stringify(preciosTalla);
        selector.appendChild(option);
    });

    // Agregar event listener para cambiar tallas cuando se selecciona producto
    selector.addEventListener('change', function () {
        updateSizeSelector();
    });
}

// Actualizar selector de tallas según el producto seleccionado
function updateSizeSelector() {
    const selector = document.getElementById('productSelector');
    const sizeSelector = document.getElementById('productSize');
    const quantityInput = document.getElementById('productQuantity');

    if (!selector || !sizeSelector) return;

    const selectedOption = selector.options[selector.selectedIndex];
    const tallasRaw = selectedOption?.dataset?.tallas || '';
    const tallas = tallasRaw.split(',').map(t => t.trim()).filter(t => t !== '');
    const preciosTalla = JSON.parse(selectedOption?.dataset?.preciosTalla || '{}');

    // Limpiar y cargar tallas
    sizeSelector.innerHTML = '<option value="">Seleccionar talla...</option>';

    if (tallas.length > 0) {
        tallas.forEach(talla => {
            const option = document.createElement('option');
            option.value = talla;
            // Verificar si hay precio específico para esta talla
            const precioTalla = preciosTalla[talla] || selectedOption?.dataset?.precio;
            const label = precioTalla ? `${talla} - ${parseInt(precioTalla).toLocaleString('es-CO')}` : talla;
            option.textContent = label;
            option.dataset.precio = precioTalla || selectedOption?.dataset?.precio || 0;
            sizeSelector.appendChild(option);
        });
        sizeSelector.disabled = false;
    } else {
        // Si no tiene tallas, mostrar opción única
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Sin talla';
        sizeSelector.appendChild(option);
        sizeSelector.disabled = true;
    }

    // Resetear cantidad
    if (quantityInput) quantityInput.value = 1;
}

// Filtrar productos por categoría
function filterProductsByCategory(categoria) {
    const selector = document.getElementById('productSelector');
    if (!selector) return;

    const options = selector.querySelectorAll('option');
    options.forEach((option, index) => {
        if (index === 0) return; // Saltar la opción por defecto
        const productCategoria = option.dataset.categoria || 'sin categoría';
        if (!categoria || productCategoria.toLowerCase() === categoria.toLowerCase()) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });

    // Resetear el selector
    selector.value = '';
}

// Buscar producto por referencia
function searchByReference(referencia) {
    if (!referencia || referencia.length < 1) {
        document.getElementById('referenceResult').classList.remove('active');
        return null;
    }

    const ref = referencia.toLowerCase().trim();
    const resultados = productos.filter(p => {
        const pRef = (p.referencia || '').toString().toLowerCase();
        return pRef.includes(ref);
    });

    const resultDiv = document.getElementById('referenceResult');

    if (resultados.length === 0) {
        resultDiv.innerHTML = '<div class="no-found">No se encontraron productos con esa referencia</div>';
        resultDiv.classList.add('active');
        return null;
    }

    // Mostrar máximo 5 resultados
    const resultadosMostrar = resultados.slice(0, 5);
    resultDiv.innerHTML = resultadosMostrar.map(p => `
        <div class="product-found" data-referencia="${p.referencia}" data-name="${p.nombre}" data-price="${p.precio}">
            <div class="product-name">${p.nombre}</div>
            <div class="product-price">${parseInt(p.precio || 0).toLocaleString('es-CO')}</div>
            <div class="product-stock">Stock: ${p.stock || 0} | Ref: ${p.referencia}</div>
        </div>
    `).join('');

    resultDiv.classList.add('active');

    // Agregar eventos click a los resultados
    resultDiv.querySelectorAll('.product-found').forEach(item => {
        item.addEventListener('click', function () {
            const productReferencia = this.dataset.referencia;
            const productName = this.dataset.name;
            const productPrice = parseFloat(this.dataset.price);

            // Seleccionar el producto en el dropdown
            const selector = document.getElementById('productSelector');
            selector.value = productReferencia;

            // Limpiar el campo de referencia
            const invoiceRefInput = document.getElementById('invoiceProductReference');
            if (invoiceRefInput) invoiceRefInput.value = '';

            resultDiv.classList.remove('active');

            showToast(`Producto seleccionado: ${productName}`, 'success');
        });
    });

    return resultados;
}

// Configurar event listeners para el sistema híbrido de selección de productos
let hybridSelectorSetup = false;
function setupHybridProductSelector() {
    if (hybridSelectorSetup) return;
    hybridSelectorSetup = true;

    const referenceInput = document.getElementById('invoiceProductReference');
    const categorySelector = document.getElementById('categorySelector');
    const referenceResult = document.getElementById('referenceResult');

    // Event listener para búsqueda por referencia (con debounce)
    let debounceTimer;
    if (referenceInput) {
        referenceInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchByReference(this.value);
            }, 300); // 300ms de delay para evitar muchas búsquedas
        });

        // Cerrar resultados al hacer click fuera
        document.addEventListener('click', function (e) {
            if (referenceResult && !referenceInput.contains(e.target) && !referenceResult.contains(e.target)) {
                referenceResult.classList.remove('active');
            }
        });

        // Buscar automáticamente al presionar Enter si hay una coincidencia exacta
        referenceInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const ref = this.value.trim();
                if (ref) {
                    // Buscar coincidencia exacta
                    const exactMatch = productos.find(p =>
                        p.referencia?.toString().toLowerCase() === ref.toLowerCase()
                    );
                    if (exactMatch) {
                        const selector = document.getElementById('productSelector');
                        selector.value = exactMatch.referencia;
                        this.value = '';
                        showToast(`Producto seleccionado: ${exactMatch.nombre}`, 'success');
                    } else {
                        // Si no hay coincidencia exacta, mostrar resultados
                        searchByReference(ref);
                    }
                }
            } else if (e.key === 'Escape') {
                referenceResult?.classList.remove('active');
            }
        });
    }

    // Event listener para filtrar por categoría
    if (categorySelector) {
        categorySelector.addEventListener('change', function () {
            filterProductsByCategory(this.value);
            // Limpiar el campo de referencia
            if (referenceInput) referenceInput.value = '';
        });
    }
}

// ==========================================
// GUARDAR Y RESTAURAR BORRADOR DE FACTURA (localStorage)
// ==========================================

function guardarBorradorFactura() {
    const formulario = {
        cliente_nombre: document.getElementById('invoiceClientName')?.value || '',
        tipo_id: document.getElementById('invoiceIdType')?.value || '',
        numero_id: document.getElementById('invoiceIdNumber')?.value || '',
        email: document.getElementById('invoiceEmail')?.value || '',
        telefono: document.getElementById('invoicePhone')?.value || '',
        metodo_pago: document.getElementById('invoicePaymentMethod')?.value || '',
        items: invoiceItems
    };

    localStorage.setItem(CONFIG.storageKey, JSON.stringify(formulario));
}

function restaurarBorradorFactura() {
    try {
        const borrador = localStorage.getItem(CONFIG.storageKey);
        if (!borrador) return false;

        const datos = JSON.parse(borrador);

        if (datos.cliente_nombre) document.getElementById('invoiceClientName').value = datos.cliente_nombre;
        if (datos.tipo_id) document.getElementById('invoiceIdType').value = datos.tipo_id;
        if (datos.numero_id) document.getElementById('invoiceIdNumber').value = datos.numero_id;
        if (datos.email) document.getElementById('invoiceEmail').value = datos.email;
        if (datos.telefono) document.getElementById('invoicePhone').value = datos.telefono;
        if (datos.metodo_pago) document.getElementById('invoicePaymentMethod').value = datos.metodo_pago;

        if (datos.items && datos.items.length > 0) {
            invoiceItems = datos.items;
            renderInvoiceItems();
            showToast('Factura anterior restaurada', 'info');
            return true;
        }
    } catch (e) {
        console.error('Error restaurando borrador:', e);
    }
    return false;
}

function limpiarBorradorFactura() {
    localStorage.removeItem(CONFIG.storageKey);
}

// Agregar producto a la factura
document.getElementById('addProductToInvoiceBtn')?.addEventListener('click', function () {
    const selector = document.getElementById('productSelector');
    const sizeSelector = document.getElementById('productSize');
    const quantityInput = document.getElementById('productQuantity');
    const productReferencia = selector.value;
    const selectedSize = sizeSelector?.value;
    const quantity = parseInt(quantityInput.value) || 1;

    // ✅ NUEVA VALIDACIÓN: Seleccionar producto
    if (!productReferencia) {
        showToast('Selecciona un producto', 'error');
        return;
    }

    // ✅ NUEVA VALIDACIÓN: Cantidad válida
    if (quantity < CONFIG.cantidadMinima || quantity > CONFIG.cantidadMaxima) {
        showToast(`Cantidad debe estar entre ${CONFIG.cantidadMinima} y ${CONFIG.cantidadMaxima}`, 'error');
        return;
    }

    const product = productos.find(p => p.referencia === productReferencia);
    if (!product) {
        showToast('Producto no encontrado', 'error');
        return;
    }

    // ✅ NUEVA VALIDACIÓN: Stock disponible
    const stockDisponible = selectedSize
        ? (product[`stock_${selectedSize}`] || 0)
        : (product.stock || 0);

    if (stockDisponible < quantity) {
        showToast(`Stock insuficiente. Disponibles: ${stockDisponible}`, 'error');
        return;
    }

    // Verificar si el producto tiene tallas y si se seleccionó una
    const tallasRaw = product.tallas || '';
    const tallas = tallasRaw.split(',').map(t => t.trim()).filter(t => t !== '');
    const tieneTallas = tallas.length > 0;

    if (tieneTallas && !selectedSize) {
        showToast('Por favor selecciona una talla', 'error');
        return;
    }

    // Obtener precio
    let precio = parseFloat(product.precio) || 0;

    // ✅ NUEVA VALIDACIÓN: Precio válido
    if (precio < CONFIG.montoMinimo) {
        showToast(`Precio debe ser mayor a $${CONFIG.montoMinimo}`, 'error');
        return;
    }

    if (selectedSize) {
        const sizeKey = selectedSize.replace(/[^a-zA-Z0-9]/g, '_');
        if (product['precio_' + sizeKey]) {
            precio = parseFloat(product['precio_' + sizeKey]);
        }
    }

    const subtotal = precio * quantity;

    invoiceItems.push({
        referencia: product.referencia,
        nombre: product.nombre,
        cantidad: quantity,
        precio_original: precio,
        precio_unitario: precio,
        subtotal: subtotal,
        talla: selectedSize || null,
        producto_id: product.id || null
    });

    renderInvoiceItems();
    selector.value = '';
    if (sizeSelector) {
        sizeSelector.innerHTML = '<option value="">Seleccionar talla...</option>';
        sizeSelector.disabled = true;
    }
    quantityInput.value = 1;

    showToast(`${product.nombre} agregado a la factura`, 'success');
    guardarBorradorFactura();
});

// Función global para modificar el precio unitario de un item (aplicar descuento)
window.updateInvoiceItemPrice = function (index, nuevoPrecioStr) {
    const item = invoiceItems[index];
    if (!item) return;

    const nuevoPrecio = parseFloat(nuevoPrecioStr);
    if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
        showToast('Ingresa un precio válido', 'error');
        renderInvoiceItems();
        return;
    }

    if (item.precio_original === undefined || item.precio_original === null) {
        item.precio_original = item.precio_unitario;
    }

    item.precio_unitario = nuevoPrecio;
    item.subtotal = nuevoPrecio * item.cantidad;
    renderInvoiceItems();
    guardarBorradorFactura();
};

// Renderizar items de la factura
function renderInvoiceItems() {
    const tbody = document.getElementById('invoiceItemsBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    let subtotalOriginal = 0;
    let totalFinal = 0;

    invoiceItems.forEach((item, index) => {
        const precioOrig = (item.precio_original !== undefined && item.precio_original !== null)
            ? parseFloat(item.precio_original)
            : parseFloat(item.precio_unitario || 0);
        const precioUnit = parseFloat(item.precio_unitario || 0);
        const cant = parseInt(item.cantidad || 1);
        const subItem = precioUnit * cant;
        item.subtotal = subItem;

        subtotalOriginal += precioOrig * cant;
        totalFinal += subItem;

        const tieneDescuento = precioUnit < precioOrig;
        const row = document.createElement('tr');
        const tallaDisplay = item.talla ? item.talla : '-';
        row.innerHTML = `
            <td>${item.referencia || '-'}</td>
            <td>${item.nombre}</td>
            <td>${tallaDisplay}</td>
            <td>${cant}</td>
            <td>
                <input type="number" min="0" step="100" value="${precioUnit}"
                    onchange="updateInvoiceItemPrice(${index}, this.value)"
                    style="width: 105px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; text-align: right; font-weight: 600;">
                ${tieneDescuento ? `<div style="font-size: 11px; color: #888; text-decoration: line-through;">Lista: $${parseInt(precioOrig).toLocaleString('es-CO')}</div>` : ''}
            </td>
            <td>$${parseInt(subItem).toLocaleString('es-CO')}</td>
            <td>
                <button type="button" onclick="removeInvoiceItem(${index})" class="btn-danger btn-small">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    const descuentoTotal = Math.max(0, subtotalOriginal - totalFinal);
    const subtotalMostrar = descuentoTotal > 0 ? subtotalOriginal : totalFinal;

    const subtotalEl = document.getElementById('invoiceSubtotal');
    const discountEl = document.getElementById('invoiceDiscount');
    const discountRow = document.getElementById('invoiceDiscountRow');
    const totalEl = document.getElementById('invoiceTotal');

    if (subtotalEl) subtotalEl.textContent = `$${parseInt(subtotalMostrar).toLocaleString('es-CO')}`;
    if (discountEl) discountEl.textContent = `-$${parseInt(descuentoTotal).toLocaleString('es-CO')}`;
    if (discountRow) discountRow.style.display = descuentoTotal > 0 ? 'flex' : 'none';
    if (totalEl) totalEl.textContent = `$${parseInt(totalFinal).toLocaleString('es-CO')}`;
}

// Función global para eliminar item
window.removeInvoiceItem = function (index) {
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
    guardarBorradorFactura();
};

// Generar factura
document.getElementById('invoiceForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (invoiceItems.length === 0) {
        showToast('Agrega al menos un producto', 'error');
        return;
    }

    // ✅ NUEVA VALIDACIÓN: Montos antes de enviar
    const subtotalOriginal = invoiceItems.reduce((sum, item) => {
        const pOrig = (item.precio_original !== undefined && item.precio_original !== null)
            ? parseFloat(item.precio_original)
            : parseFloat(item.precio_unitario || 0);
        return sum + (pOrig * (item.cantidad || 1));
    }, 0);
    const subtotalTotal = invoiceItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const descuentoTotal = Math.max(0, subtotalOriginal - subtotalTotal);

    if (subtotalTotal < CONFIG.montoMinimo) {
        showToast(`Total debe ser mayor a $${CONFIG.montoMinimo}`, 'error');
        return;
    }

    const clienteNombre = document.getElementById('invoiceClientName').value;
    const tipoId = document.getElementById('invoiceIdType').value;
    const numeroId = document.getElementById('invoiceIdNumber').value;
    const email = document.getElementById('invoiceEmail').value;
    const telefono = document.getElementById('invoicePhone').value;

    // ✅ NUEVA VALIDACIÓN: Datos del cliente
    if (!clienteNombre || !tipoId || !numeroId) {
        showToast('Complete datos del cliente', 'error');
        return;
    }

    const metodoPago = document.getElementById('invoicePaymentMethod')?.value || 'efectivo';

    const items = invoiceItems.map(item => ({
        producto_id: item.producto_id,
        referencia: item.referencia,
        producto_referencia: item.referencia,
        nombre: item.nombre,
        producto_nombre: item.nombre,
        cantidad: item.cantidad,
        precio_original: item.precio_original ?? item.precio_unitario,
        precio_unitario: item.precio_unitario,
        talla: item.talla || null
    }));

    showToast('Generando factura...', 'info');

    try {
        const { data, error } = await supabase.rpc('crear_factura_con_stock', {
            p_cliente_nombre: clienteNombre,
            p_cliente_identificacion: `${tipoId} ${numeroId}`,
            p_items: items,
            p_cliente_email: email || null,
            p_cliente_telefono: telefono || null,
            p_metodo_pago: metodoPago,
            p_descuento: descuentoTotal
        });

        if (error) throw error;

        if (data && data.success) {
            showToast(`Factura ${data.numero_factura} generada correctamente`, 'success');

            // ✅ REGISTRAR AUDITORÍA
            registrarAuditoria('CREAR_FACTURA', {
                numero_factura: data.numero_factura,
                cliente: clienteNombre,
                total: subtotalTotal
            });

            // Limpiar formulario
            document.getElementById('invoiceForm').reset();
            invoiceItems = [];
            renderInvoiceItems();
            limpiarBorradorFactura(); // ✅ Borrar draft después de guardar

            // Recargar historial e inventario real desde Supabase
            loadInvoiceHistory();
            await fetchInventory();
            loadProductSelector();
        } else {
            showToast(data?.message || 'Error al generar factura', 'error');
        }
    } catch (err) {
        console.error('Error:', err);
        showToast('Error al generar factura: ' + err.message, 'error');
    }
});

// Cancelar factura
document.getElementById('cancelInvoiceBtn')?.addEventListener('click', function () {
    document.getElementById('invoiceForm').reset();
    invoiceItems = [];
    renderInvoiceItems();
});

// Nueva factura
document.getElementById('newInvoiceBtn')?.addEventListener('click', function () {
    document.getElementById('invoiceForm').reset();
    invoiceItems = [];
    renderInvoiceItems();
    limpiarBorradorFactura();
    document.getElementById('invoiceFormContainer').scrollIntoView({ behavior: 'smooth' });
});

// BÚSQUEDA AUTOMÁTICA DE CLIENTE
async function buscarClienteAutomatico() {
    const tipoId = document.getElementById('invoiceIdType').value;
    const numeroId = document.getElementById('invoiceIdNumber').value.trim();

    if (!tipoId || !numeroId) return;

    try {
        const identificacion = `${tipoId} ${numeroId}`;
        const { data, error } = await supabase.rpc('buscar_cliente', {
            p_identificacion: identificacion
        });

        if (error) throw error;

        if (data && data.encontrado) {
            const cliente = data.cliente;
            document.getElementById('invoiceClientName').value = cliente.nombre || '';
            document.getElementById('invoiceEmail').value = cliente.email || '';
            document.getElementById('invoicePhone').value = cliente.telefono || '';
            showToast('Datos del cliente cargados', 'info');
        }
    } catch (err) {
        console.error('Error buscando cliente:', err);
    }
}

// Listeners para búsqueda automática
document.getElementById('invoiceIdNumber')?.addEventListener('blur', buscarClienteAutomatico);
document.getElementById('invoiceIdNumber')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        buscarClienteAutomatico();
    }
});
document.getElementById('invoiceIdType')?.addEventListener('change', buscarClienteAutomatico);

// ==========================================
// CARGAR HISTORIAL CON PAGINACIÓN Y FILTROS
// ==========================================

let currentPage = 1;
let allInvoices = [];
let filteredInvoices = [];

async function loadInvoiceHistory() {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    try {
        const response = await fetch(
            `${CONFIG.supabaseUrl}/rest/v1/facturas?select=*&order=fecha_creacion.desc`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.supabaseAnonKey,
                    'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`
                }
            }
        );

        if (!response.ok) throw new Error('Error cargando facturas');
        allInvoices = await response.json();
        currentPage = 1;
        aplicarFiltros();
    } catch (err) {
        console.error('Error cargando facturas:', err);
        showToast('Error al cargar facturas', 'error');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error al cargar facturas</td></tr>';
    }
}

function aplicarFiltros() {
    const fechaDesde = document.getElementById('filterFechaDesde')?.value;
    const fechaHasta = document.getElementById('filterFechaHasta')?.value;
    const cliente = document.getElementById('filterCliente')?.value.toLowerCase();
    const estado = document.getElementById('filterEstado')?.value;

    filteredInvoices = allInvoices.filter(factura => {
        const fechaFactura = new Date(factura.fecha_creacion);

        if (fechaDesde && new Date(fechaDesde) > fechaFactura) return false;
        if (fechaHasta && new Date(fechaHasta) < fechaFactura) return false;
        if (cliente && !factura.cliente_nombre.toLowerCase().includes(cliente)) return false;
        if (estado && factura.estado !== estado) return false;

        return true;
    });

    currentPage = 1;
    renderInvoiceTable();
}

function renderInvoiceTable() {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    const inicio = (currentPage - 1) * CONFIG.itemsPorPagina;
    const fin = inicio + CONFIG.itemsPorPagina;
    const facturasPagina = filteredInvoices.slice(inicio, fin);

    tbody.innerHTML = '';

    if (facturasPagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay facturas para mostrar</td></tr>';
        actualizarPaginacion();
        return;
    }

    facturasPagina.forEach(factura => {
        const fechaHora = formatDate(factura.fecha_creacion);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${factura.numero_factura}</td>
            <td>${fechaHora}</td>
            <td>${factura.cliente_nombre}</td>
            <td>${formatCurrency(factura.total)}</td>
            <td><span class="status-badge ${factura.estado === 'activa' ? 'active' : 'cancelled'}">${factura.estado}</span></td>
            <td class="action-btns">
                <button onclick="viewInvoice(${factura.id})" class="view-btn" title="Ver">
                    <i class="fas fa-eye"></i>
                </button>
                ${factura.estado === 'activa' ? `
                <button onclick="cancelInvoice(${factura.id})" class="cancel-btn" title="Anular">
                    <i class="fas fa-times"></i>
                </button>
                ` : ''}
                ${hasPermission('puedeEliminarFactura') ? `
                <button onclick="deleteInvoiceComplete(${factura.id})" class="cancel-btn" title="Eliminar del todo" style="background: #495057; color: white;">
                    <i class="fas fa-trash-alt"></i>
                </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });

    actualizarPaginacion();
}

function actualizarPaginacion() {
    const totalPaginas = Math.ceil(filteredInvoices.length / CONFIG.itemsPorPagina);
    const paginationDiv = document.getElementById('invoicePagination');

    if (!paginationDiv) return;

    paginationDiv.innerHTML = `
        <div style="display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 20px;">
            <button onclick="cambiarPagina(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="btn-secondary">
                ← Anterior
            </button>
            <span>Página ${currentPage} de ${totalPaginas || 1}</span>
            <button onclick="cambiarPagina(${currentPage + 1})" ${currentPage === totalPaginas ? 'disabled' : ''} class="btn-secondary">
                Siguiente →
            </button>
        </div>
    `;
}

window.cambiarPagina = function (nuevaPagina) {
    const totalPaginas = Math.ceil(filteredInvoices.length / CONFIG.itemsPorPagina);
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
        currentPage = nuevaPagina;
        renderInvoiceTable();
        document.getElementById('invoicesTableBody').scrollIntoView({ behavior: 'smooth' });
    }
};

// Agregar listeners a filtros
document.getElementById('filterFechaDesde')?.addEventListener('change', aplicarFiltros);
document.getElementById('filterFechaHasta')?.addEventListener('change', aplicarFiltros);
document.getElementById('filterCliente')?.addEventListener('input', aplicarFiltros);
document.getElementById('filterEstado')?.addEventListener('change', aplicarFiltros);

// Funciones globales para ver/anular facturas
// NOTA: Esta función fue movida a factura-impresion.js
// window.viewInvoice ahora se define en factura-impresion.js
// ==========================================
// MÓDULO LEY 1581 - Gestión de Autorizaciones
// ==========================================

let allLegalConsents = [];

async function loadLegalConsents() {
    const tableBody = document.getElementById('legalTableBody');
    if (!tableBody) {
        alert('❌ ERROR: No se encontró el elemento legalTableBody en el HTML');
        return;
    }

    tableBody.innerHTML = `
        <tr class="loading-row">
            <td colspan="6" class="text-center" style="padding: 2rem;">
                <i class="fas fa-spinner fa-spin"></i> Cargando autorizaciones...
            </td>
        </tr>`;

    try {
        const sessionToken = localStorage.getItem('supabase_session_token');
        const authHeader = sessionToken ? `Bearer ${sessionToken}` : `Bearer ${SUPABASE_ANON_KEY}`;
        const url = `${SUPABASE_URL}/rest/v1/auditoria_legal_datos?select=*&order=fecha_autorizacion.desc`;

        // DIAGNÓSTICO: mostrar URL usada
        console.log('🔍 [Ley1581] Fetch URL:', url);
        console.log('🔍 [Ley1581] Token sesión:', sessionToken ? 'SÍ hay token' : 'NO hay token, usando anon key');

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': authHeader
            }
        });

        console.log('🔍 [Ley1581] HTTP Status:', response.status);

        const responseText = await response.text();
        console.log('🔍 [Ley1581] Respuesta raw:', responseText);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        const data = JSON.parse(responseText);
        console.log('🔍 [Ley1581] Registros encontrados:', data.length);

        allLegalConsents = data || [];
        renderLegalTable(allLegalConsents);

        const searchInput = document.getElementById('legalSearchInput');
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.dataset.listenerAttached = 'true';
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const filtered = allLegalConsents.filter(c =>
                    (c.nombre || '').toLowerCase().includes(term) ||
                    (c.identificacion || '').toLowerCase().includes(term)
                );
                renderLegalTable(filtered);
            });
        }

    } catch (err) {
        console.error('❌ [Ley1581] Error:', err);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red; padding:2rem;">
            <i class="fas fa-exclamation-circle"></i> Error: ${err.message}
        </td></tr>`;
    }
}

function renderLegalTable(data) {
    const tableBody = document.getElementById('legalTableBody');
    if (!tableBody) return;

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem;">No se encontraron registros.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(c => {
        const fecha = new Date(c.fecha_autorizacion).toLocaleString('es-CO');
        return `
            <tr>
                <td>${fecha}</td>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.tipo_id || ''} ${c.identificacion}</td>
                <td>${c.email || 'N/A'}</td>
                <td>v${c.politica_version || '1.0'}</td>
                <td>
                    <button class="btn-action" onclick="imprimirCertificadoLey1581(${c.id})" title="Imprimir Certificado" style="background: #6f42c1; color: white; padding: 5px 10px; border-radius: 4px; border: none; cursor: pointer;">
                        <i class="fas fa-print"></i> Certificado
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.imprimirCertificadoLey1581 = (id) => {
    const consent = allLegalConsents.find(c => c.id === id);
    if (!consent) return;

    const fecha = new Date(consent.fecha_autorizacion).toLocaleString('es-CO');

    // Crear una ventana temporal para impresión
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Certificado de Autorización - MumiNita</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                .header { text-align: center; border-bottom: 2px solid #F5B7B1; padding-bottom: 20px; margin-bottom: 30px; }
                .logo { font-size: 24px; font-weight: bold; color: #8E44AD; }
                .title { font-size: 20px; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
                .content { background: #fdfdfd; padding: 30px; border: 1px solid #eee; border-radius: 8px; }
                .data-row { margin-bottom: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px; }
                .label { font-weight: bold; color: #555; width: 200px; display: inline-block; }
                .footer { margin-top: 50px; font-size: 12px; color: #777; text-align: center; }
                .legal-text { margin-top: 30px; font-style: italic; font-size: 13px; text-align: justify; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="header">
                <div class="logo">MumiNita - Tienda Infantil</div>
                <div class="title">Certificado de Autorización de Tratamiento de Datos</div>
            </div>
            <div class="content">
                <div class="data-row"><span class="label">ID de Registro:</span> #LEG-${consent.id}</div>
                <div class="data-row"><span class="label">Fecha y Hora:</span> ${fecha}</div>
                <div class="data-row"><span class="label">Nombre Completo:</span> ${consent.nombre}</div>
                <div class="data-row"><span class="label">Identificación:</span> ${consent.tipo_id || ''} ${consent.identificacion}</div>
                <div class="data-row"><span class="label">Correo Electrónico:</span> ${consent.email || 'No registrado'}</div>
                <div class="data-row"><span class="label">Versión de Política:</span> v${consent.politica_version || '1.0'}</div>
                
                <div class="legal-text">
                    MumiNita hace constar que el titular de los datos personales arriba mencionados ha otorgado su autorización previa, expresa e informada para el tratamiento de su información personal, de acuerdo con la Ley 1581 de 2012 de protección de datos personales de Colombia. Esta autorización fue recolectada de manera digital a través de nuestro portal web muminita.com.
                </div>
            </div>
            <div class="footer">
                Documento generado automáticamente por el sistema administrativo de MumiNita.<br>
                Este certificado sirve como prueba legal de la autorización otorgada por el titular.
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
};

/*
window.viewInvoice = async function(id) {
    try {
        const response = await fetch(
            `https://toryoblzisspbemtehcl.supabase.co/rest/v1/facturas?id=eq.${id}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'sb_publishable_0UVvh06wWLiIHg1e0msf7g_Qh9I4smr',
                    'Authorization': 'Bearer sb_publishable_0UVvh06wWLiIHg1e0msf7g_Qh9I4smr'
                }
            }
        );
        
        if (!response.ok) throw new Error('Error cargando factura');
        const data = await response.json();
        
        if (data && data.length > 0) {
            alert(`Factura: ${data[0].numero_factura}\nCliente: ${data[0].cliente_nombre}\nTotal: ${parseInt(data[0].total).toLocaleString('es-CO')}\nEstado: ${data[0].estado}`);
        }
    } catch (err) {
        showToast('Error al ver factura', 'error');
    }
};

window.cancelInvoice = async function(id) {
    if (!confirm('¿Estás seguro de anular esta factura? Se restaurará el stock.')) return;
    
    try {
        const result = await supabase.rpc('anular_factura', { p_factura_id: id });
        
        if (result.error) throw result.error;
        
        if (result.data && result.data.success) {
            showToast('Factura anulada y stock restaurado', 'success');
            loadInvoiceHistory();
        } else {
            showToast(result.data?.message || 'Error al anular factura', 'error');
        }
    } catch (err) {
        console.error('Error:', err);
        showToast('Error al anular factura: ' + err.message, 'error');
    }
};
*/