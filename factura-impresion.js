// ==========================================
// FACTURAS - Impresión y PDF (Régimen Simplificado)
// MumiNita - Sistema de Facturación
// ==========================================

let facturaActual = null;
let itemsActual = null;

// ==========================================
// GENERAR CONTENIDO DE FACTURA - FORMATO SIMPLIFICADO
// ==========================================

function getFacturaContent(factura, items, formato = 'termico') {
    const fecha = formatDate(factura.fecha_creacion);
    
    let itemsArray = items;
    if (!itemsArray && factura.items) {
        itemsArray = typeof factura.items === 'string' 
            ? JSON.parse(factura.items) 
            : factura.items;
    }
    
    // Calcular totales y descuento
    let subtotalOriginal = 0;
    let subtotalNeto = 0;
    let detallesItems = [];
    
    if (itemsArray && itemsArray.length > 0) {
        itemsArray.forEach(item => {
            const cantidad = item.cantidad || 1;
            const precio = parseFloat(item.precio_unitario ?? item.precio ?? 0);
            const precioOrig = parseFloat(item.precio_original ?? precio);
            const subtotalItem = cantidad * precio;
            subtotalNeto += subtotalItem;
            subtotalOriginal += cantidad * precioOrig;
            
            detallesItems.push({
                referencia: item.referencia || item.producto_referencia || '-',
                nombre: item.nombre || item.producto_nombre || 'Producto',
                talla: item.talla || null,
                cantidad: cantidad,
                precio_original: precioOrig,
                precio: precio,
                subtotal: subtotalItem
            });
        });
    }
    
    const descuentoCalculado = Math.max(0, subtotalOriginal - subtotalNeto);
    const descuento = parseFloat(factura.descuento || 0) > 0 ? parseFloat(factura.descuento) : descuentoCalculado;
    const subtotalMostrar = descuento > 0 ? Math.max(subtotalOriginal, subtotalNeto + descuento) : subtotalNeto;
    const ivaTotal = CONFIG.iva > 0 ? Math.round(subtotalNeto * CONFIG.iva / 100) : 0;
    const total = subtotalNeto + ivaTotal;
    
    if (formato === 'matriz') {
        // FORMATO PARA IMPRESORA MATRIZ DE PUNTOS (ASCII art)
        return getFacturaMatrizPuntos(factura, detallesItems, subtotalMostrar, ivaTotal, total, descuento);
    } else if (formato === 'termico') {
        // FORMATO PARA IMPRESORA TÉRMICA (80mm)
        return getFacturaTermica(factura, detallesItems, subtotalMostrar, ivaTotal, total, descuento);
    } else {
        // FORMATO PARA PDF (A4/A5)
        return getFacturaPDF(factura, detallesItems, subtotalMostrar, ivaTotal, total, descuento);
    }
}

function getFacturaTermica(factura, items, subtotal, iva, total, descuento = 0) {
    const fecha = formatDate(factura.fecha_creacion);
    
    let html = `
        <div style="width: 80mm; font-family: 'Courier New', monospace; font-size: 11px; padding: 5px; margin: 0;">
            <!-- ENCABEZADO EMPRESA -->
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px;">
                <h1 style="margin: 0; font-size: 16px; font-weight: bold;">${CONFIG.nombreEmpresa}</h1>
                <p style="margin: 2px 0; font-size: 10px;">${CONFIG.subtituloEmpresa}</p>
                <p style="margin: 2px 0; font-size: 9px;">NIT: ${CONFIG.nit}</p>
                <p style="margin: 2px 0; font-size: 9px;">${CONFIG.direccion}</p>
                <p style="margin: 2px 0; font-size: 9px;">Tel: ${CONFIG.telefono}</p>
                <p style="margin: 2px 0; font-size: 9px;">${CONFIG.email}</p>
            </div>
            
            <!-- DATOS DE LA FACTURA -->
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; font-size: 10px;">
                <p style="margin: 2px 0;"><b>RECIBO #${factura.numero_factura}</b></p>
                <p style="margin: 2px 0;">Fecha: ${fecha}</p>
            </div>
            
            <!-- DATOS DEL CLIENTE -->
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; font-size: 9px;">
                <p style="margin: 2px 0;"><b>CLIENTE:</b></p>
                <p style="margin: 2px 0;">${factura.cliente_nombre}</p>
                <p style="margin: 2px 0;">${factura.cliente_tipo_id}: ${factura.cliente_identificacion}</p>
                ${factura.cliente_telefono ? `<p style="margin: 2px 0;">Tel: ${factura.cliente_telefono}</p>` : ''}
            </div>
            
            <!-- TABLA DE PRODUCTOS -->
            <table style="width: 100%; border-collapse: collapse; font-size: 8px; margin-bottom: 8px; border: 1px solid #000;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; background: #f0f0f0;">
                        <th style="text-align: left; padding: 2px 3px; border-right: 1px solid #000;">REF</th>
                        <th style="text-align: left; padding: 2px 3px; border-right: 1px solid #000;">DESCRIPCIÓN</th>
                        <th style="text-align: center; padding: 2px 3px; border-right: 1px solid #000;">CAN</th>
                        <th style="text-align: right; padding: 2px 3px; border-right: 1px solid #000;">PRECIO</th>
                        <th style="text-align: right; padding: 2px 3px;">SUBTOTAL</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    items.forEach(item => {
        const ref = item.referencia.substring(0, 6);
        const nombre = item.nombre.substring(0, 12);
        const tallaText = item.talla ? ` (${item.talla})` : '';
        
        html += `
                    <tr style="border-bottom: 1px dashed #ccc;">
                        <td style="padding: 2px 3px; text-align: left; border-right: 1px solid #ccc; font-weight: bold;">${ref}</td>
                        <td style="padding: 2px 3px; text-align: left; border-right: 1px solid #ccc;">${nombre}${tallaText}</td>
                        <td style="padding: 2px 3px; text-align: center; border-right: 1px solid #ccc;">${item.cantidad}</td>
                        <td style="padding: 2px 3px; text-align: right; border-right: 1px solid #ccc;">$${formatCurrency(item.precio)}</td>
                        <td style="padding: 2px 3px; text-align: right; font-weight: bold;">$${formatCurrency(item.subtotal)}</td>
                    </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            
            <!-- TOTALES -->
            <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin: 3px 0; font-size: 10px;">
                    <span>Subtotal:</span>
                    <span>$${formatCurrency(subtotal)}</span>
                </div>
                ${descuento > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 3px 0; font-size: 10px; font-weight: bold;">
                    <span>Descuento:</span>
                    <span>-$${formatCurrency(descuento)}</span>
                </div>
                ` : ''}
                ${CONFIG.iva > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 3px 0; font-size: 10px;">
                    <span>IVA (${CONFIG.iva}%):</span>
                    <span>$${formatCurrency(iva)}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; margin: 3px 0; font-weight: bold; font-size: 12px;">
                    <span>TOTAL:</span>
                    <span>$${formatCurrency(total)}</span>
                </div>
            </div>
            
            <!-- MÉTODO DE PAGO Y ESTADO -->
            <div style="text-align: center; font-size: 9px; margin-bottom: 8px;">
                <p style="margin: 2px 0;">Pago: ${(factura.metodo_pago || 'Efectivo').toUpperCase()}</p>
                <p style="margin: 2px 0;">Estado: ${(factura.estado || 'Activa').toUpperCase()}</p>
            </div>
            
            <!-- PIE DE PÁGINA -->
            <div style="text-align: center; border-top: 1px dashed #000; padding-top: 8px; font-size: 9px;">
                <p style="margin: 5px 0;">¡GRACIAS POR SU COMPRA!</p>
                <p style="margin: 5px 0;">Régimen Simplificado</p>
                <p style="margin: 5px 0;">${CONFIG.website}</p>
            </div>
        </div>
    `;
    
    return html;
}

function getFacturaMatrizPuntos(factura, items, subtotal, iva, total, descuento = 0) {
    const fecha = formatDate(factura.fecha_creacion);
    
    let html = `
        <pre style="font-family: 'Courier New', monospace; font-size: 12px; width: 80ch; white-space: pre-wrap; line-height: 1;">
================================================================
                      ${CONFIG.nombreEmpresa}
                      ${CONFIG.subtituloEmpresa}
================================================================
                           RECIBO
================================================================

NIT: ${CONFIG.nit}
Dirección: ${CONFIG.direccion}
Teléfono: ${CONFIG.telefono}
Email: ${CONFIG.email}

================================================================
Número Recibo: ${factura.numero_factura}
Fecha: ${fecha}
================================================================

CLIENTE: ${factura.cliente_nombre}
${factura.cliente_tipo_id}: ${factura.cliente_identificacion}
${factura.cliente_telefono ? 'Teléfono: ' + factura.cliente_telefono : ''}

================================================================
REF    DESCRIPCION          CAN  PRECIO UNIT  SUBTOTAL
================================================================
`;

    items.forEach(item => {
        const ref = String(item.referencia).substring(0, 6).padEnd(6);
        const desc = String(item.nombre).substring(0, 18).padEnd(18);
        const tallaText = item.talla ? `(${item.talla})` : '';
        const cant = String(item.cantidad).padStart(3);
        const precio = ('$' + formatCurrency(item.precio)).padStart(11);
        const subtot = ('$' + formatCurrency(item.subtotal)).padStart(11);
        
        html += `${ref} ${desc} ${cant} ${precio} ${subtot}\n`;
        if (tallaText) {
            html += `         ${tallaText}\n`;
        }
    });

    html += `================================================================
                        RESUMEN FINANCIERO
================================================================

Subtotal..........................$${formatCurrency(subtotal)}
${descuento > 0 ? `Descuento........................-$${formatCurrency(descuento)}\n` : ''}${iva > 0 ? `IVA ${CONFIG.iva}%.............................$${formatCurrency(iva)}\n` : ''}
================================================================
TOTAL A PAGAR......................$${formatCurrency(total)}
================================================================

Método de Pago: ${(factura.metodo_pago || 'EFECTIVO').toUpperCase()}
Estado: ${(factura.estado || 'ACTIVA').toUpperCase()}

================================================================
                   ¡GRACIAS POR SU COMPRA!
                    Régimen Simplificado
                     ${CONFIG.website}
================================================================
        </pre>
    `;
    
    return html;
}

function getFacturaPDF(factura, items, subtotal, iva, total, descuento = 0) {
    const fecha = formatDate(factura.fecha_creacion);
    
    let html = `
        <div style="max-width: 210mm; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
            <!-- ENCABEZADO -->
            <div style="text-align: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="margin: 0 0 5px 0; font-size: 28px;">${CONFIG.nombreEmpresa}</h1>
                <p style="margin: 5px 0; font-size: 14px;">${CONFIG.subtituloEmpresa}</p>
                <div style="font-size: 11px; color: #333;">
                    <p style="margin: 3px 0;">NIT: ${CONFIG.nit}</p>
                    <p style="margin: 3px 0;">${CONFIG.direccion}</p>
                    <p style="margin: 3px 0;">Teléfono: ${CONFIG.telefono} | Email: ${CONFIG.email}</p>
                    <p style="margin: 3px 0;">Web: ${CONFIG.website}</p>
                </div>
            </div>
            
            <!-- INFORMACIÓN DOCUMENTO -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <h3 style="border-bottom: 1px solid #000; padding-bottom: 5px;">RECIBO</h3>
                    <p style="margin: 5px 0;"><b>Número:</b> ${factura.numero_factura}</p>
                    <p style="margin: 5px 0;"><b>Fecha:</b> ${fecha}</p>
                    <p style="margin: 5px 0;"><b>Estado:</b> <span style="background: ${factura.estado === 'activa' ? '#28a745' : '#dc3545'}; color: white; padding: 2px 8px; border-radius: 3px;">${(factura.estado || 'Activa').toUpperCase()}</span></p>
                    ${factura.vendedor_email ? `<p style="margin: 5px 0;"><b>Atendido por:</b> ${factura.vendedor_email}</p>` : ''}
                    ${factura.estado === 'anulada' && factura.motivo_anulacion ? `<p style="margin: 5px 0; color: #dc3545;"><b>Motivo anulación:</b> ${factura.motivo_anulacion}${factura.anulado_por ? ` (${factura.anulado_por})` : ''}</p>` : ''}
                </div>
                <div>
                    <h3 style="border-bottom: 1px solid #000; padding-bottom: 5px;">CLIENTE</h3>
                    <p style="margin: 5px 0;"><b>${factura.cliente_nombre}</b></p>
                    <p style="margin: 5px 0;">${factura.cliente_tipo_id}: ${factura.cliente_identificacion}</p>
                    ${factura.cliente_telefono ? `<p style="margin: 5px 0;">Tel: ${factura.cliente_telefono}</p>` : ''}
                    ${factura.cliente_email ? `<p style="margin: 5px 0;">Email: ${factura.cliente_email}</p>` : ''}
                </div>
            </div>
            
            <!-- TABLA DE PRODUCTOS -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; table-layout: fixed;">
                <thead>
                    <tr style="background: #f0f0f0; border-bottom: 2px solid #000;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd; width: 12%;">Referencia</th>
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd; width: 28%;">Descripción</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd; width: 10%;">Talla</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd; width: 10%;">Cantidad</th>
                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd; width: 15%;">Precio Unit.</th>
                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd; width: 15%;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    items.forEach(item => {
        html += `
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; width: 12%; word-wrap: break-word;">${item.referencia || '-'}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; width: 28%; word-wrap: break-word;">${item.nombre || 'Producto'}</td>
                        <td style="padding: 10px; text-align: center; border: 1px solid #ddd; width: 10%;">${item.talla || '-'}</td>
                        <td style="padding: 10px; text-align: center; border: 1px solid #ddd; width: 10%;">${item.cantidad || 0}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; width: 15%;">$${formatCurrency(item.precio || 0)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; width: 15%; font-weight: bold;">$${formatCurrency(item.subtotal || 0)}</td>
                    </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            
            <!-- RESUMEN FINANCIERO -->
            <div style="width: 100%; max-width: 400px; margin-left: auto; margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd;">
                    <span>Subtotal:</span>
                    <span>$${formatCurrency(subtotal)}</span>
                </div>
                ${descuento > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; color: #28a745; font-weight: bold;">
                    <span>Descuento dado:</span>
                    <span>-$${formatCurrency(descuento)}</span>
                </div>
                ` : ''}
                ${CONFIG.iva > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd;">
                    <span>IVA (${CONFIG.iva}%):</span>
                    <span>$${formatCurrency(iva)}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding: 12px; background: #f0f0f0; font-weight: bold; font-size: 16px; border: 2px solid #000;">
                    <span>TOTAL A PAGAR:</span>
                    <span>$${formatCurrency(total)}</span>
                </div>
            </div>
            
            <!-- INFORMACIÓN ADICIONAL -->
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <p style="margin: 5px 0;"><b>Método de Pago:</b> ${(factura.metodo_pago || 'Efectivo').toUpperCase()}</p>
                <p style="margin: 5px 0;">Régimen: Simplificado</p>
                <p style="margin: 5px 0; font-size: 12px; color: #666;">Este documento está autorizado bajo régimen simplificado conforme a la legislación tributaria vigente.</p>
            </div>
            
            <!-- PIE DE PÁGINA -->
            <div style="text-align: center; border-top: 2px solid #000; padding-top: 20px; color: #666;">
                <p style="margin: 10px 0; font-size: 14px; font-weight: bold;">¡GRACIAS POR SU COMPRA!</p>
                <p style="margin: 10px 0; font-size: 11px;">${CONFIG.website}</p>
                <p style="margin: 10px 0; font-size: 10px;">Documento generado: ${new Date().toLocaleString('es-CO')}</p>
            </div>
        </div>
    `;
    
    return html;
}

// ==========================================
// DESCARGAR PDF (jsPDF)
// ==========================================

// ==========================================
// DESCARGAR PDF (jsPDF + html2canvas)
// ==========================================

async function descargarPDF() {
    if (!facturaActual) {
        showToast('No hay factura para descargar', 'error');
        return;
    }
    
    try {
        showToast('Generando PDF...', 'info');
        
        // Cargar html2canvas
        const script1 = document.createElement('script');
        script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        
        // Cargar jsPDF
        const script2 = document.createElement('script');
        script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        
        // Cuando ambas se cargan
        let scriptCount = 0;
        const onScriptLoad = () => {
            scriptCount++;
            if (scriptCount === 2) {
                generarPDFReal();
            }
        };
        
        script1.onload = onScriptLoad;
        script2.onload = onScriptLoad;
        
        script1.onerror = () => {
            showToast('Error al cargar html2canvas', 'error');
        };
        
        script2.onerror = () => {
            showToast('Error al cargar jsPDF', 'error');
        };
        
        document.head.appendChild(script1);
        document.head.appendChild(script2);
        
    } catch (error) {
        console.error('Error descargando PDF:', error);
        showToast('Error al descargar PDF', 'error');
    }
}

async function generarPDFReal() {
    try {
        const { jsPDF } = window.jspdf;
        const html2canvas = window.html2canvas;
        
        // Crear elemento temporal con el contenido
        const element = document.createElement('div');
        element.innerHTML = getFacturaContent(facturaActual, itemsActual, 'pdf');
        element.style.width = '210mm';
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        element.style.top = '-9999px';
        document.body.appendChild(element);
        
        // Convertir HTML a canvas
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        // Crear PDF desde canvas
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 20; // márgenes de 10mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 10;
        
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        // Descargar
        pdf.save(`Recibo_${facturaActual.numero_factura}.pdf`);
        document.body.removeChild(element);
        
        showToast('PDF descargado correctamente', 'success');
        registrarAuditoria('DESCARGAR_PDF', `Recibo #${facturaActual.numero_factura}`);
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        showToast('Error al generar PDF: ' + error.message, 'error');
    }
}

// ==========================================
// IMPRIMIR EN IMPRESORA TÉRMICA / FÍSICA
// ==========================================

function imprimirFactura() {
    if (!facturaActual) {
        showToast('No hay factura para imprimir', 'error');
        return;
    }
    
    try {
        // Crear ventana de impresión
        const printWindow = window.open('', '', 'width=800,height=600');
        const facturaHTML = getFacturaContent(facturaActual, itemsActual, 'matriz');
        
        const contenido = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Imprimir Recibo #${facturaActual.numero_factura}</title>
                <style>
                    * { 
                        margin: 0; 
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    html, body { 
                        width: 100%;
                        height: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    
                    body { 
                        font-family: 'Courier New', monospace;
                        background: white;
                        padding: 5px;
                        font-size: 13px;
                        line-height: 1;
                    }
                    
                    pre {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 13px;
                        line-height: 1.2;
                        white-space: pre;
                        overflow: visible;
                        margin: 0;
                        padding: 0;
                        width: 80ch;
                    }
                    
                    @page {
                        size: 80mm auto;
                        margin: 0;
                        padding: 0;
                    }
                    
                    @media print {
                        * {
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        
                        html, body {
                            width: 80mm;
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white !important;
                        }
                        
                        body {
                            padding: 0 !important;
                        }
                        
                        pre {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 80mm !important;
                            page-break-after: avoid;
                            font-size: 13px !important;
                        }
                        
                        .print-button {
                            display: none !important;
                        }
                    }
                    
                    .print-button {
                        text-align: center;
                        padding: 20px;
                        background: #f0f0f0;
                        margin-bottom: 20px;
                    }
                    
                    button {
                        padding: 10px 20px;
                        margin: 5px;
                        font-size: 14px;
                        cursor: pointer;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-family: Arial, sans-serif;
                    }
                    
                    button:hover { 
                        background: #0056b3; 
                    }
                </style>
            </head>
            <body>
                <div class="print-button">
                    <button onclick="window.print()">🖨️ Imprimir</button>
                    <button onclick="window.close()">❌ Cerrar</button>
                </div>
                ${facturaHTML}
            </body>
            </html>
        `;
        
        printWindow.document.open();
        printWindow.document.write(contenido);
        printWindow.document.close();
        
        registrarAuditoria('IMPRIMIR_FACTURA', `Recibo #${facturaActual.numero_factura}`);
    } catch (error) {
        console.error('Error imprimiendo:', error);
        showToast('Error al preparar impresión', 'error');
    }
}


// ==========================================
// MODAL PARA VER FACTURA
// ==========================================

function mostrarModalFactura(factura, items) {
    facturaActual = factura;
    itemsActual = items;
    
    const modal = document.getElementById('facturaModal') || crearModal();
    const contenidoModal = modal.querySelector('.modal-content-factura');
    
    if (contenidoModal) {
        const facturaHTML = getFacturaContent(factura, items, 'pdf');
        contenidoModal.innerHTML = facturaHTML;
    }
    
    modal.style.display = 'flex';
}

function crearModal() {
    const modal = document.createElement('div');
    modal.id = 'facturaModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
        <div style="background: white; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto; border-radius: 8px; position: relative;">
            <div style="position: sticky; top: 0; background: white; padding: 15px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0;">Vista Previa de Recibo</h2>
                <button onclick="document.getElementById('facturaModal').style.display='none'" style="background: transparent; border: none; font-size: 24px; cursor: pointer;">×</button>
            </div>
            <div class="modal-content-factura" style="padding: 20px;"></div>
            <div style="padding: 15px; border-top: 1px solid #ddd; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end;">
                <button onclick="enviarReciboWhatsApp()" style="background: #25D366; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
                </button>
                <button onclick="descargarPDF()" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-download"></i> Descargar PDF
                </button>
                <button onclick="imprimirFactura()" style="background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button onclick="document.getElementById('facturaModal').style.display='none'" style="background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
    
    document.body.appendChild(modal);
    return modal;
}

function cerrarModalFactura() {
    const modal = document.getElementById('facturaModal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// VER FACTURA DESDE EL HISTORIAL
// ==========================================

async function viewInvoice(id) {
    try {
        showToast('Cargando factura...', 'info');
        
        const response = await fetch(`${CONFIG.supabaseUrl}/rest/v1/facturas?id=eq.${id}`, {
            headers: {
                'apikey': CONFIG.supabaseAnonKey,
                'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Error cargando factura');
        
        const facturas = await response.json();
        if (!facturas || facturas.length === 0) {
            showToast('Factura no encontrada', 'error');
            return;
        }
        
        const factura = facturas[0];
        const items =typeof factura.items === 'string' ? JSON.parse(factura.items) : factura.items;
        
        mostrarModalFactura(factura, items);
        showToast('Factura cargada', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la factura', 'error');
    }
}

// ==========================================
// ENVIAR RECIBO POR WHATSAPP EN 1 CLIC
// ==========================================

async function enviarReciboWhatsApp(facturaOId = null) {
    try {
        let factura = facturaActual;

        if (facturaOId && typeof facturaOId === 'object') {
            factura = facturaOId;
        } else if (facturaOId && (typeof facturaOId === 'number' || typeof facturaOId === 'string')) {
            const response = await fetch(`${CONFIG.supabaseUrl}/rest/v1/facturas?id=eq.${facturaOId}`, {
                headers: supabase.getHeaders()
            });
            if (!response.ok) throw new Error('No se pudo cargar la factura');
            const rows = await response.json();
            factura = rows[0];
        }

        if (!factura) {
            showToast('No hay factura seleccionada para enviar', 'error');
            return;
        }

        let itemsArr = factura.items || itemsActual || [];
        if (typeof itemsArr === 'string') {
            try { itemsArr = JSON.parse(itemsArr); } catch (e) { itemsArr = []; }
        }

        let subtotalOrig = 0;
        let subtotalNeto = 0;
        const lineasItems = itemsArr.map(item => {
            const cant = parseInt(item.cantidad || 1);
            const pUnit = parseFloat(item.precio_unitario ?? item.precio ?? 0);
            const pOrig = parseFloat(item.precio_original ?? pUnit);
            const sub = cant * pUnit;
            subtotalNeto += sub;
            subtotalOrig += cant * pOrig;
            const tallaTxt = item.talla ? ` (Talla ${item.talla})` : '';
            return `• ${cant}x ${item.nombre || item.producto_nombre || 'Producto'}${tallaTxt} — $${formatCurrency(sub)}`;
        });

        const descuento = parseFloat(factura.descuento || 0) > 0
            ? parseFloat(factura.descuento)
            : Math.max(0, subtotalOrig - subtotalNeto);
        const subtotalMostrar = descuento > 0 ? Math.max(subtotalOrig, subtotalNeto + descuento) : subtotalNeto;
        const total = parseFloat(factura.total ?? subtotalNeto);
        const fecha = factura.fecha_creacion ? formatDate(factura.fecha_creacion) : formatDate(new Date());

        let mensaje = `🧾 *RECIBO DE COMPRA - ${CONFIG.nombreEmpresa}*\n`;
        mensaje += `_${CONFIG.subtituloEmpresa}_\n`;
        mensaje += `NIT: ${CONFIG.nit}\n`;
        mensaje += `────────────────────\n`;
        mensaje += `*Recibo #:* ${factura.numero_factura}\n`;
        mensaje += `*Fecha:* ${fecha}\n`;
        mensaje += `*Cliente:* ${factura.cliente_nombre || '-'}\n`;
        mensaje += `*ID:* ${factura.cliente_identificacion || '-'}\n`;
        mensaje += `────────────────────\n`;
        mensaje += `*Detalle de compra:*\n`;
        mensaje += lineasItems.join('\n') + `\n`;
        mensaje += `────────────────────\n`;
        if (descuento > 0) {
            mensaje += `Subtotal: $${formatCurrency(subtotalMostrar)}\n`;
            mensaje += `Descuento dado: -$${formatCurrency(descuento)}\n`;
        }
        mensaje += `*TOTAL PAGADO: $${formatCurrency(total)}*\n`;
        mensaje += `Método de pago: ${(factura.metodo_pago || 'Efectivo').toUpperCase()}\n`;
        mensaje += `────────────────────\n`;
        mensaje += `¡Gracias por tu compra en *${CONFIG.nombreEmpresa}*! 💖\n`;
        mensaje += `${CONFIG.direccion}\n`;
        mensaje += `${CONFIG.website}`;

        // Limpiar teléfono del cliente
        let rawPhone = (factura.cliente_telefono || '').replace(/\D/g, '');
        if (!rawPhone) {
            const ingresado = prompt('El cliente no tiene teléfono registrado.\nIngresa el número de WhatsApp (ej. 3161234567) o deja vacío para elegir el contacto:');
            if (ingresado === null) return; // Cancelado
            rawPhone = ingresado.replace(/\D/g, '');
        }
        if (rawPhone.length === 10 && rawPhone.startsWith('3')) {
            rawPhone = '57' + rawPhone;
        }

        const waUrl = rawPhone
            ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(mensaje)}`
            : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

        window.open(waUrl, '_blank');
        registrarAuditoria('ENVIAR_RECIBO_WHATSAPP', `Factura #${factura.numero_factura}`);
    } catch (error) {
        console.error('Error enviando por WhatsApp:', error);
        showToast('Error al preparar envío por WhatsApp', 'error');
    }
}

// ==========================================
// ANULAR FACTURA (Con motivo obligatorio)
// ==========================================

async function cancelInvoice(id) {
    const motivo = prompt('⚠️ MOTIVO OBLIGATORIO DE ANULACIÓN:\nEscribe brevemente por qué se anula esta factura (ej. "Cambio de talla", "Error de digitación"):');
    if (motivo === null) return; // Usuario canceló
    if (motivo.trim().length < 3) {
        showToast('Debes escribir un motivo válido (mínimo 3 caracteres) para anular la factura', 'error');
        return;
    }

    if (!confirm(`¿Confirmas anular esta factura?\nMotivo: "${motivo.trim()}"\n\nSe devolverán las prendas al inventario.`)) return;
    
    try {
        showToast('Anulando factura...', 'info');
        const anuladoPor = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : null;
        
        const { data, error } = await supabase.rpc('anular_factura', {
            p_factura_id: id,
            p_motivo: motivo.trim(),
            p_anulado_por: anuladoPor
        });
        if (error) throw error;
        
        if (data && data.success) {
            showToast(data.message || 'Factura anulada y stock restaurado', 'success');
            registrarAuditoria('ANULAR_FACTURA', { factura_id: id, motivo: motivo.trim(), anulado_por: anuladoPor });
            loadInvoiceHistory();
            if (typeof fetchInventory === 'function') await fetchInventory();
            if (typeof loadProductSelector === 'function') loadProductSelector();
        } else {
            showToast(data?.message || 'No se pudo anular la factura', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al anular la factura: ' + error.message, 'error');
    }
}

// ==========================================
// ELIMINAR FACTURA POR COMPLETO (Pruebas)
// ==========================================

async function deleteInvoiceComplete(id) {
    if (typeof hasPermission === 'function' && !hasPermission('puedeEliminarFactura')) {
        showToast('No tienes permiso para eliminar facturas. Solo puedes anularlas.', 'error');
        return;
    }

    if (!confirm('⚠️ ¿Está seguro de ELIMINAR POR COMPLETO esta factura? Esta acción borrará el registro de la base de datos permanentemente y restaurará el stock si la factura estaba activa.')) return;
    
    try {
        showToast('Eliminando factura...', 'info');
        
        const { data, error } = await supabase.rpc('eliminar_factura_completa', { p_factura_id: id });
        if (error) throw error;
        
        if (data && data.success) {
            showToast(data.message || 'Factura eliminada y stock restaurado', 'success');
            registrarAuditoria('ELIMINAR_FACTURA_COMPLETA', `Factura ID: ${id}`);
            loadInvoiceHistory();
            if (typeof fetchInventory === 'function') await fetchInventory();
            if (typeof loadProductSelector === 'function') loadProductSelector();
        } else {
            showToast(data?.message || 'Error al eliminar factura', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al eliminar la factura: ' + error.message, 'error');
    }
}

// ==========================================
// EXPORTAR A WINDOW OBJECT
// ==========================================

window.viewInvoice = viewInvoice;
window.cancelInvoice = cancelInvoice;
window.deleteInvoiceComplete = deleteInvoiceComplete;
window.descargarPDF = descargarPDF;
window.imprimirFactura = imprimirFactura;
window.enviarReciboWhatsApp = enviarReciboWhatsApp;