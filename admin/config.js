// ==========================================
// CONFIGURACIÓN CENTRALIZADA
// MumiNita - Sistema de Facturación
// ==========================================

// Credenciales y URLs de Supabase
const CONFIG = {
    // Supabase
    supabaseUrl: 'https://toryoblzisspbemtehcl.supabase.co',
    supabaseAnonKey: 'sb_publishable_0UVvh06wWLiIHg1e0msf7g_Qh9I4smr',
    
     // Configuración de facturación
    iva: 0, // Porcentaje de IVA (0% = sin IVA)
    nit: '1113660486-8',
    nombreEmpresa: 'MUMINITA',
    subtituloEmpresa: 'Tienda de Ropa Infantil',
    direccion: 'C.C. La 26, Carrera 26 #30-25 Local 2, Palmira',
    telefono: '316 254 5794',
    email: 'muminita-0405@hotmail.com',
    website: 'www.muminita.com',
    
    // Paginación
    itemsPorPagina: 20,
    
    // Límites de validación
    cantidadMinima: 1,
    cantidadMaxima: 999,
    montoMinimo: 100,
    
    // Almacenamiento local
    storageKey: 'muminita_factura_draft',
    storageKeyAuditoria: 'muminita_auditoria'
};

// Función para formatear moneda
function formatCurrency(num) {
    return parseInt(num || 0).toLocaleString('es-CO');
}

// Función para formatear fecha
function formatDate(date) {
    return new Date(date).toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Sistema de notificaciones reemplazando alerts
function showNotification(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Alias para compatibilidad con código existente
function showToast(message, type) {
    showNotification(message, type || 'success');
}

// Guardar en auditoría
function registrarAuditoria(accion, detalles = {}) {
    if (!window.currentUser) return;
    
    const registro = {
        timestamp: new Date().toISOString(),
        usuario: window.currentUser.email,
        accion: accion,
        detalles: detalles
    };
    
    try {
        let auditoria = JSON.parse(localStorage.getItem(CONFIG.storageKeyAuditoria)) || [];
        auditoria.push(registro);
        // Mantener últimos 100 registros
        auditoria = auditoria.slice(-100);
        localStorage.setItem(CONFIG.storageKeyAuditoria, JSON.stringify(auditoria));
    } catch (e) {
        console.error('Error registrando auditoría:', e);
    }
}