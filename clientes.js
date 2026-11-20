// ==========================================
// MÓDULO DE GESTIÓN DE CLIENTES
// ==========================================

let clientesData = [];
let clientesFiltrados = [];
let paginaActualClientes = 1;
let clientesPorPagina = 10;
let editandoClienteId = null;

// ==========================================
// CARGAR CLIENTES DESDE SUPABASE
// ==========================================

async function cargarClientes() {
    try {
        showToast('Cargando clientes...', 'info');
        const { data, error } = await supabase.rpc('listar_clientes');
        
        if (error) throw error;
        
        clientesData = data || [];
        clientesFiltrados = clientesData.slice();
        renderizarTablaClientes();
        showToast('Clientes cargados correctamente', 'success');
    } catch (err) {
        console.error('Error cargando clientes:', err);
        showToast('Error al cargar clientes: ' + err.message, 'error');
    }
}

// ==========================================
// ABRIR MODAL DE NUEVO CLIENTE
// ==========================================

function abrirModalNuevoCliente() {
    editandoClienteId = null;
    document.getElementById('modalTituloCliente').textContent = 'Nuevo Cliente';
    document.getElementById('formCliente').reset();
    document.getElementById('clienteModal').classList.add('active');
    document.getElementById('clienteModal').classList.remove('hidden');
}

// ==========================================
// CERRAR MODAL DE CLIENTE
// ==========================================

function cerrarModalCliente() {
    document.getElementById('clienteModal').classList.remove('active');
    document.getElementById('clienteModal').classList.add('hidden');
    document.getElementById('formCliente').reset();
    editandoClienteId = null;
}

// ==========================================
// VALIDAR CLIENTE
// ==========================================

function validarCliente(tipoId, identificacion, nombre, email, telefono) {
    // Tipo ID requerido
    if (!tipoId || tipoId.trim() === '') {
        showToast('El tipo de identificación es requerido', 'error');
        return false;
    }

    // Identificación requerida
    if (!identificacion || identificacion.trim() === '') {
        showToast('El número de identificación es requerido', 'error');
        return false;
    }
    
    // Nombre requerido
    if (!nombre || nombre.trim() === '') {
        showToast('El nombre es requerido', 'error');
        return false;
    }
    
    // Email válido si se proporciona
    if (email && email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showToast('El email no es válido', 'error');
            return false;
        }
    }
    
    // Teléfono: si se proporciona, debe tener al menos 7 dígitos
    if (telefono && telefono.trim() !== '') {
        const phoneRegex = /^\d{7,}$/;
        if (!phoneRegex.test(telefono.replace(/\D/g, ''))) {
            showToast('El teléfono debe tener al menos 7 dígitos', 'error');
            return false;
        }
    }
    
    return true;
}

// ==========================================
// CREAR/ACTUALIZAR CLIENTE
// ==========================================

document.getElementById('formCliente')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const tipoId = document.getElementById('clienteTipoId').value;
    const numeroIdentificacion = document.getElementById('clienteIdentificacion').value.trim();
    const nombre = document.getElementById('clienteNombre').value.trim();
    const email = document.getElementById('clienteEmail').value.trim();
    const telefono = document.getElementById('clienteTelefono').value.trim();
    const direccion = document.getElementById('clienteDireccion').value.trim();
    
    // Concatenar tipo y número
    const identificacionCompleta = `${tipoId} ${numeroIdentificacion}`;
    
    // Validar
    if (!validarCliente(tipoId, numeroIdentificacion, nombre, email, telefono)) {
        return;
    }
    
    try {
        if (editandoClienteId) {
            // ACTUALIZAR CLIENTE
            const { data, error } = await supabase.rpc('actualizar_cliente', {
                p_id: editandoClienteId,
                p_nombre: nombre,
                p_email: email || null,
                p_telefono: telefono || null,
                p_direccion: direccion || null
            });
            
            if (error) throw error;
            const res = (Array.isArray(data) ? data[0] : data) || {};
            if (res.success) {
                showToast('Cliente actualizado correctamente', 'success');
                registrarAuditoria('CLIENTE_ACTUALIZADO', `Cliente ID ${editandoClienteId} actualizado`);
            } else {
                showToast('Error: ' + (res.message || 'No se pudo actualizar'), 'error');
            }
        } else {
            // CREAR NUEVO CLIENTE
            const { data, error } = await supabase.rpc('crear_cliente', {
                p_identificacion: identificacionCompleta,
                p_nombre: nombre,
                p_email: email || null,
                p_telefono: telefono || null,
                p_direccion: direccion || null
            });
            
            if (error) throw error;
            const res = (Array.isArray(data) ? data[0] : data) || {};
            if (res.success) {
                showToast('Cliente creado correctamente', 'success');
                registrarAuditoria('CLIENTE_CREADO', `Cliente ${nombre} (${identificacionCompleta}) creado con ID ${res.cliente_id || ''}`);
            } else {
                showToast('Error: ' + (res.message || 'No se pudo crear'), 'error');
                return;
            }
        }
        
        cerrarModalCliente();
        await cargarClientes();
    } catch (err) {
        console.error('Error guardando cliente:', err);
        showToast('Error al guardar cliente: ' + err.message, 'error');
    }
});

// ==========================================
// EDITAR CLIENTE
// ==========================================

async function editarCliente(id) {
    try {
        const cliente = clientesData.find(c => c.id === id);
        
        if (!cliente) {
            showToast('Cliente no encontrado', 'error');
            return;
        }
        
        editandoClienteId = id;
        document.getElementById('modalTituloCliente').textContent = 'Editar Cliente';
        
        // Intentar separar el tipo y el número
        const partesId = (cliente.identificacion || "").split(" ");
        if (partesId.length >= 2) {
            document.getElementById('clienteTipoId').value = partesId[0];
            document.getElementById('clienteIdentificacion').value = partesId.slice(1).join(" ");
        } else {
            // Si no tiene tipo (datos antiguos), dejar tipo en blanco y numero completo
            document.getElementById('clienteTipoId').value = "";
            document.getElementById('clienteIdentificacion').value = cliente.identificacion;
        }

        document.getElementById('clienteNombre').value = cliente.nombre;
        document.getElementById('clienteEmail').value = cliente.email || '';
        document.getElementById('clienteTelefono').value = cliente.telefono || '';
        document.getElementById('clienteDireccion').value = cliente.direccion || '';
        
        // Campos de identificación deshabilitados al editar
        document.getElementById('clienteTipoId').disabled = true;
        document.getElementById('clienteIdentificacion').disabled = true;
        
        document.getElementById('clienteModal').classList.add('active');
        document.getElementById('clienteModal').classList.remove('hidden');
    } catch (err) {
        console.error('Error editando cliente:', err);
        showToast('Error al editar cliente: ' + err.message, 'error');
    }
}

// ==========================================
// ELIMINAR CLIENTE
// ==========================================

async function eliminarCliente(id) {
    const cliente = clientesData.find(c => c.id === id);
    
    if (!cliente) {
        showToast('Cliente no encontrado', 'error');
        return;
    }
    
    if (!confirm(`¿Estás seguro de que deseas eliminar al cliente ${cliente.nombre}? Esta acción no se puede deshacer.`)) {
        return;
    }
    
    try {
        showToast('Eliminando cliente...', 'info');
        const { data, error } = await supabase.rpc('eliminar_cliente', {
            p_id: id
        });
        
        if (error) throw error;
        
        const res = (Array.isArray(data) ? data[0] : data) || {};
        if (res.success) {
            showToast('Cliente eliminado correctamente', 'success');
            registrarAuditoria('CLIENTE_ELIMINADO', `Cliente ${cliente.nombre} (${cliente.identificacion}) eliminado`);
            await cargarClientes();
        } else {
            showToast('Error: ' + (res.message || 'No se pudo eliminar'), 'error');
        }
    } catch (err) {
        console.error('Error eliminando cliente:', err);
        showToast('Error al eliminar cliente: ' + err.message, 'error');
    }
}

// ==========================================
// BUSCAR CLIENTES
// ==========================================

function buscarClientes(texto) {
    paginaActualClientes = 1;
    
    if (!texto || texto.trim() === '') {
        clientesFiltrados = clientesData.slice();
    } else {
        const textoBusqueda = texto.toLowerCase();
        clientesFiltrados = clientesData.filter(cliente => {
            return cliente.identificacion.toLowerCase().includes(textoBusqueda) ||
                   cliente.nombre.toLowerCase().includes(textoBusqueda) ||
                   (cliente.email && cliente.email.toLowerCase().includes(textoBusqueda)) ||
                   (cliente.telefono && cliente.telefono.includes(texto));
        });
    }
    
    renderizarTablaClientes();
}

// ==========================================
// RENDERIZAR TABLA DE CLIENTES
// ==========================================

function renderizarTablaClientes() {
    const tbody = document.getElementById('clientesTableBody');
    
    if (!tbody) return;
    
    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7" class="text-center">No hay clientes registrados</td></tr>';
        document.getElementById('clientesPaginacion').innerHTML = '';
        return;
    }
    
    // Paginar
    const inicio = (paginaActualClientes - 1) * clientesPorPagina;
    const fin = inicio + clientesPorPagina;
    const clientesPagina = clientesFiltrados.slice(inicio, fin);
    
    const puedeEditar = typeof hasPermission === 'function' ? hasPermission('puedeEditarCliente') : true;
    const puedeEliminar = typeof hasPermission === 'function' ? hasPermission('puedeEliminarCliente') : true;

    let html = '';
    clientesPagina.forEach(cliente => {
        const fechaRegistro = cliente.fecha_registro ? formatDate(new Date(cliente.fecha_registro)) : '-';
        
        let accionesHtml = '';
        if (puedeEditar) {
            accionesHtml += `
                <button type="button" class="btn-edit" onclick="editarCliente(${cliente.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>`;
        }
        if (puedeEliminar) {
            accionesHtml += `
                <button type="button" class="btn-delete" onclick="eliminarCliente(${cliente.id})" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>`;
        }
        if (!accionesHtml) {
            accionesHtml = '<span style="color: #999; font-size: 12px;">Solo lectura</span>';
        }

        html += `
            <tr>
                <td><strong>${escapeHtml(cliente.identificacion)}</strong></td>
                <td>${escapeHtml(cliente.nombre)}</td>
                <td>${cliente.email ? escapeHtml(cliente.email) : '-'}</td>
                <td>${cliente.telefono ? escapeHtml(cliente.telefono) : '-'}</td>
                <td>${cliente.direccion ? escapeHtml(cliente.direccion.substring(0, 40)) + '...' : '-'}</td>
                <td>${fechaRegistro}</td>
                <td class="actions">${accionesHtml}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Renderizar paginación
    renderizarPaginacionClientes();
}

// ==========================================
// RENDERIZAR PAGINACIÓN
// ==========================================

function renderizarPaginacionClientes() {
    const paginacionDiv = document.getElementById('clientesPaginacion');
    if (!paginacionDiv) return;
    
    const totalPaginas = Math.ceil(clientesFiltrados.length / clientesPorPagina);
    
    if (totalPaginas <= 1) {
        paginacionDiv.innerHTML = '';
        return;
    }
    
    let html = '<div class="pagination">';
    
    // Botón anterior
    if (paginaActualClientes > 1) {
        html += `<button class="page-btn" onclick="cambiarPaginaClientes(${paginaActualClientes - 1})">
                    <i class="fas fa-chevron-left"></i> Anterior
                 </button>`;
    }
    
    // Números de página
    for (let i = 1; i <= totalPaginas; i++) {
        if (i === paginaActualClientes) {
            html += `<button class="page-btn active">${i}</button>`;
        } else if (i <= 3 || i >= totalPaginas - 2 || Math.abs(i - paginaActualClientes) <= 1) {
            html += `<button class="page-btn" onclick="cambiarPaginaClientes(${i})">${i}</button>`;
        } else if (i === 4 || i === totalPaginas - 3) {
            html += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    // Botón siguiente
    if (paginaActualClientes < totalPaginas) {
        html += `<button class="page-btn" onclick="cambiarPaginaClientes(${paginaActualClientes + 1})">
                    Siguiente <i class="fas fa-chevron-right"></i>
                 </button>`;
    }
    
    html += '</div>';
    paginacionDiv.innerHTML = html;
}

// ==========================================
// CAMBIAR PÁGINA
// ==========================================

function cambiarPaginaClientes(numeroPagina) {
    paginaActualClientes = numeroPagina;
    renderizarTablaClientes();
    
    // Scroll al inicio de la tabla
    document.getElementById('clientesTableContainer')?.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.getElementById('nuevoClienteBtn')?.addEventListener('click', function() {
    // Habilitar campos de identificación
    document.getElementById('clienteTipoId').disabled = false;
    document.getElementById('clienteIdentificacion').disabled = false;
    abrirModalNuevoCliente();
});

document.getElementById('cerrarModalClienteBtn')?.addEventListener('click', cerrarModalCliente);

document.getElementById('cancelarClienteBtn')?.addEventListener('click', cerrarModalCliente);

document.getElementById('clienteModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        cerrarModalCliente();
    }
});

document.getElementById('buscarClienteInput')?.addEventListener('input', function(e) {
    buscarClientes(e.target.value);
});

// ==========================================
// INICIALIZAR MÓDULO
// ==========================================

function inicializarClientesModule() {
    if (localStorage.getItem('supabase_session_token')) {
        cargarClientes();
    }
}

// Cargar clientes cuando se abre la pestaña de clientes
document.getElementById('clientesBtn')?.addEventListener('click', function() {
    cargarClientes();
});

// Inicializar si ya hay sesión activa
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('supabase_session_token')) {
        setTimeout(inicializarClientesModule, 1000);
    }
});
