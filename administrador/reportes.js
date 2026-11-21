// ==========================================
// MÓDULO DE REPORTES, CIERRE DE CAJA Y ALERTAS DE STOCK
// Exclusivo para rol: admin
// ==========================================

let reportesFacturasCache = [];
let reportesInitialized = false;

function getLocalDateISO(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function inicializarModuloReportes() {
    const inicioInput = document.getElementById('reporteFechaInicio');
    const finInput = document.getElementById('reporteFechaFin');

    const hoy = getLocalDateISO();
    if (inicioInput && !inicioInput.value) inicioInput.value = hoy;
    if (finInput && !finInput.value) finInput.value = hoy;

    if (!reportesInitialized) {
        reportesInitialized = true;

        document.getElementById('btnGenerarReporte')?.addEventListener('click', cargarDatosReportes);
        document.getElementById('btnReporteHoy')?.addEventListener('click', () => {
            const h = getLocalDateISO();
            if (inicioInput) inicioInput.value = h;
            if (finInput) finInput.value = h;
            cargarDatosReportes();
        });
        document.getElementById('btnReporteSemana')?.addEventListener('click', () => {
            const hoyD = new Date();
            const hace7 = new Date();
            hace7.setDate(hoyD.getDate() - 6);
            if (inicioInput) inicioInput.value = getLocalDateISO(hace7);
            if (finInput) finInput.value = getLocalDateISO(hoyD);
            cargarDatosReportes();
        });
        document.getElementById('btnReporteMes')?.addEventListener('click', () => {
            const hoyD = new Date();
            const primero = new Date(hoyD.getFullYear(), hoyD.getMonth(), 1);
            if (inicioInput) inicioInput.value = getLocalDateISO(primero);
            if (finInput) finInput.value = getLocalDateISO(hoyD);
            cargarDatosReportes();
        });
    }

    cargarDatosReportes();
}

async function cargarDatosReportes() {
    try {
        showToast('Actualizando reportes y cierre de caja...', 'info');
        const response = await fetch(
            `${CONFIG.supabaseUrl}/rest/v1/facturas?select=*&order=fecha_creacion.desc`,
            {
                method: 'GET',
                headers: supabase.getHeaders()
            }
        );

        if (!response.ok) throw new Error('Error consultando facturas para reportes');
        reportesFacturasCache = (await response.json()) || [];

        renderizarCierreDeCaja();
        renderizarTopMasVendidas();
        renderizarAlertasStockPorTalla();
    } catch (err) {
        console.error('Error cargando reportes:', err);
        showToast('Error al cargar reportes: ' + err.message, 'error');
    }
}

function getFacturasFiltradasPorRango() {
    const inicioStr = document.getElementById('reporteFechaInicio')?.value;
    const finStr = document.getElementById('reporteFechaFin')?.value;

    return reportesFacturasCache.filter(f => {
        if (!f.fecha_creacion) return false;
        const fechaLocal = getLocalDateISO(new Date(f.fecha_creacion));
        if (inicioStr && fechaLocal < inicioStr) return false;
        if (finStr && fechaLocal > finStr) return false;
        return true;
    });
}

function renderizarCierreDeCaja() {
    const facturasRango = getFacturasFiltradasPorRango();
    const activas = facturasRango.filter(f => (f.estado || 'activa') === 'activa');
    const anuladas = facturasRango.filter(f => f.estado === 'anulada');

    let totalVendido = 0;
    let totalDescuentos = 0;
    const porMetodo = {};
    const porVendedor = {};

    activas.forEach(f => {
        const total = parseFloat(f.total || 0);
        const desc = parseFloat(f.descuento || 0);
        totalVendido += total;
        totalDescuentos += desc;

        const metodo = (f.metodo_pago || 'efectivo').toLowerCase().trim();
        if (!porMetodo[metodo]) porMetodo[metodo] = { cantidad: 0, total: 0 };
        porMetodo[metodo].cantidad += 1;
        porMetodo[metodo].total += total;

        const vendedor = f.vendedor_email || 'Sin registrar';
        if (!porVendedor[vendedor]) porVendedor[vendedor] = { cantidad: 0, total: 0, descuentos: 0 };
        porVendedor[vendedor].cantidad += 1;
        porVendedor[vendedor].total += total;
        porVendedor[vendedor].descuentos += desc;
    });

    // Tarjetas principales
    const elTotal = document.getElementById('repTotalVendido');
    const elActivas = document.getElementById('repCantVentas');
    const elDescuentos = document.getElementById('repTotalDescuentos');
    const elAnuladas = document.getElementById('repCantAnuladas');

    if (elTotal) elTotal.textContent = `$${parseInt(totalVendido).toLocaleString('es-CO')}`;
    if (elActivas) elActivas.textContent = activas.length;
    if (elDescuentos) elDescuentos.textContent = `$${parseInt(totalDescuentos).toLocaleString('es-CO')}`;
    if (elAnuladas) elAnuladas.textContent = anuladas.length;

    // Desglose por método de pago
    const metodoBody = document.getElementById('repMetodosBody');
    if (metodoBody) {
        const metodosOrden = Object.entries(porMetodo).sort((a, b) => b[1].total - a[1].total);
        if (metodosOrden.length === 0) {
            metodoBody.innerHTML = '<tr><td colspan="3" class="text-center">Sin ventas en este periodo</td></tr>';
        } else {
            metodoBody.innerHTML = metodosOrden.map(([metodo, info]) => `
                <tr>
                    <td style="text-transform: capitalize; font-weight: 600;">${escapeHtml(metodo)}</td>
                    <td style="text-align: center;">${info.cantidad}</td>
                    <td style="text-align: right; font-weight: 700; color: #28a745;">$${parseInt(info.total).toLocaleString('es-CO')}</td>
                </tr>
            `).join('');
        }
    }

    // Desglose por vendedor
    const vendedorBody = document.getElementById('repVendedoresBody');
    if (vendedorBody) {
        const vendedoresOrden = Object.entries(porVendedor).sort((a, b) => b[1].total - a[1].total);
        if (vendedoresOrden.length === 0) {
            vendedorBody.innerHTML = '<tr><td colspan="4" class="text-center">Sin ventas en este periodo</td></tr>';
        } else {
            vendedorBody.innerHTML = vendedoresOrden.map(([vendedor, info]) => `
                <tr>
                    <td>${escapeHtml(vendedor)}</td>
                    <td style="text-align: center;">${info.cantidad}</td>
                    <td style="text-align: right; color: #e67e22;">$${parseInt(info.descuentos).toLocaleString('es-CO')}</td>
                    <td style="text-align: right; font-weight: 700;">$${parseInt(info.total).toLocaleString('es-CO')}</td>
                </tr>
            `).join('');
        }
    }

    // Tabla detalle de ventas del periodo
    const detalleBody = document.getElementById('repDetalleVentasBody');
    if (detalleBody) {
        if (facturasRango.length === 0) {
            detalleBody.innerHTML = '<tr><td colspan="8" class="text-center">No hay facturas en el rango seleccionado</td></tr>';
        } else {
            detalleBody.innerHTML = facturasRango.map(f => {
                const fecha = f.fecha_creacion ? formatDate(f.fecha_creacion) : '-';
                const desc = parseFloat(f.descuento || 0);
                const esAnulada = f.estado === 'anulada';
                const motivoHtml = esAnulada
                    ? `<div style="font-size: 11px; color: #dc3545; margin-top: 2px;"><strong>Motivo:</strong> ${escapeHtml(f.motivo_anulacion || 'Sin motivo')}${f.anulado_por ? ` (${escapeHtml(f.anulado_por)})` : ''}</div>`
                    : '';
                return `
                    <tr style="${esAnulada ? 'opacity: 0.72; background: #fff5f5;' : ''}">
                        <td><strong>${escapeHtml(f.numero_factura)}</strong></td>
                        <td>${fecha}</td>
                        <td>${escapeHtml(f.cliente_nombre || '-')}</td>
                        <td>${escapeHtml(f.vendedor_email || 'Sin registrar')}</td>
                        <td style="text-transform: capitalize;">${escapeHtml(f.metodo_pago || 'efectivo')}</td>
                        <td style="color: ${desc > 0 ? '#28a745' : '#999'};">${desc > 0 ? '-$' + parseInt(desc).toLocaleString('es-CO') : '$0'}</td>
                        <td style="font-weight: 700;">$${parseInt(f.total || 0).toLocaleString('es-CO')}</td>
                        <td>
                            <span class="badge ${esAnulada ? 'badge-anulada' : 'badge-activa'}" style="padding: 3px 8px; border-radius: 4px; background: ${esAnulada ? '#dc3545' : '#28a745'}; color: #fff; font-size: 11px;">
                                ${(f.estado || 'activa').toUpperCase()}
                            </span>
                            ${motivoHtml}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

function renderizarTopMasVendidas() {
    const tbody = document.getElementById('repTopProductosBody');
    if (!tbody) return;

    const conteo = {};
    const activas = reportesFacturasCache.filter(f => (f.estado || 'activa') === 'activa');

    activas.forEach(f => {
        let items = f.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) return;

        items.forEach(item => {
            const ref = item.referencia || item.producto_referencia || 'SIN-REF';
            const nombre = item.nombre || item.producto_nombre || 'Producto';
            const key = `${ref}||${nombre}`;
            const cant = parseInt(item.cantidad || 1);
            const ingresos = parseFloat(item.precio_unitario ?? item.precio ?? 0) * cant;
            const talla = item.talla ? String(item.talla) : null;

            if (!conteo[key]) {
                conteo[key] = { ref, nombre, unidades: 0, ingresos: 0, tallas: {} };
            }
            conteo[key].unidades += cant;
            conteo[key].ingresos += ingresos;
            if (talla) {
                conteo[key].tallas[talla] = (conteo[key].tallas[talla] || 0) + cant;
            }
        });
    });

    const top = Object.values(conteo)
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 10);

    if (top.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Aún no hay ventas registradas</td></tr>';
        return;
    }

    tbody.innerHTML = top.map((p, idx) => {
        const tallasTop = Object.entries(p.tallas)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t, c]) => `T${t} (${c})`)
            .join(', ') || '-';
        return `
            <tr>
                <td style="text-align: center; font-weight: 700;">#${idx + 1}</td>
                <td><strong>${escapeHtml(p.ref)}</strong> - ${escapeHtml(p.nombre)}</td>
                <td>${escapeHtml(tallasTop)}</td>
                <td style="text-align: center; font-weight: 700; color: #007bff;">${p.unidades}</td>
                <td style="text-align: right; font-weight: 600;">$${parseInt(p.ingresos).toLocaleString('es-CO')}</td>
            </tr>
        `;
    }).join('');
}

function renderizarAlertasStockPorTalla() {
    const tbody = document.getElementById('repBajoStockTallasBody');
    const resumenDiv = document.getElementById('repResumenTallasCriticas');
    if (!tbody) return;

    const listaProductos = (typeof allProductos !== 'undefined' && allProductos.length > 0) ? allProductos : (typeof productos !== 'undefined' ? productos : []);
    const tallasPosibles = ['00', '0', '1', '2', '4', '6', '8', '10', '12'];
    const alertas = [];
    const criticasPorTalla = {};

    listaProductos.forEach(p => {
        const tallasDeclaradas = (p.tallas || '')
            .split(',')
            .map(t => t.trim())
            .filter(t => t !== '');

        const tallasRevisar = tallasDeclaradas.length > 0
            ? tallasDeclaradas.filter(t => tallasPosibles.includes(t))
            : tallasPosibles.filter(t => p[`stock_${t}`] !== null && p[`stock_${t}`] !== undefined && parseInt(p[`stock_${t}`]) > 0);

        const tallasCriticas = [];
        tallasRevisar.forEach(t => {
            const stockVal = parseInt(p[`stock_${t}`] ?? 0);
            if (stockVal <= 2) {
                tallasCriticas.push({ talla: t, stock: stockVal });
                criticasPorTalla[t] = (criticasPorTalla[t] || 0) + 1;
            }
        });

        if (tallasCriticas.length > 0) {
            alertas.push({
                referencia: p.referencia,
                nombre: p.nombre,
                categoria: p.categoria || '-',
                tallasCriticas
            });
        }
    });

    // Resumen de tallas más agotadas/críticas
    if (resumenDiv) {
        const tallasOrden = Object.entries(criticasPorTalla).sort((a, b) => b[1] - a[1]);
        if (tallasOrden.length === 0) {
            resumenDiv.innerHTML = '<span style="color: #28a745; font-weight: 600;"><i class="fas fa-check-circle"></i> ¡Excelente! No hay tallas con bajo stock.</span>';
        } else {
            resumenDiv.innerHTML = '<strong>Tallas con más referencias por surtir:</strong> ' + tallasOrden.map(([t, cant]) =>
                `<span style="display: inline-block; background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 3px 8px; border-radius: 12px; margin: 2px 4px; font-size: 12px; font-weight: 600;">Talla ${escapeHtml(t)}: ${cant} ref(s)</span>`
            ).join('');
        }
    }

    if (alertas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: #28a745;">Todas las tallas tienen buen inventario</td></tr>';
        return;
    }

    tbody.innerHTML = alertas.map(a => {
        const badges = a.tallasCriticas.map(tc => {
            const agotado = tc.stock === 0;
            const bg = agotado ? '#f8d7da' : '#fff3cd';
            const color = agotado ? '#721c24' : '#856404';
            const label = agotado ? 'AGOTADA' : `${tc.stock} und`;
            return `<span style="display:inline-block; background:${bg}; color:${color}; padding:2px 7px; border-radius:4px; margin:2px; font-size:11px; font-weight:600;">T${escapeHtml(tc.talla)}: ${label}</span>`;
        }).join(' ');

        return `
            <tr>
                <td><strong>${escapeHtml(a.referencia)}</strong></td>
                <td>${escapeHtml(a.nombre)}</td>
                <td>${escapeHtml(a.categoria)}</td>
                <td>${badges}</td>
            </tr>
        `;
    }).join('');
}

window.inicializarModuloReportes = inicializarModuloReportes;
window.cargarDatosReportes = cargarDatosReportes;

