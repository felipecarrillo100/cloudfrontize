'use strict';

/**
 * CloudFrontize Developer UI - Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const requestFeed = document.getElementById('request-feed');
    const portDisplay = document.getElementById('current-port');
    
    // Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const presetGrid = document.getElementById('preset-grid');

    function syncPresets(tabId) {
        if (!presetGrid) return;
        if (tabId === 'request-overrides') {
            presetGrid.className = 'preset-grid show-request';
        } else {
            presetGrid.className = 'preset-grid show-response';
        }
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            document.getElementById(tabId).classList.add('active');
            syncPresets(tabId);
        });
    });

    // Initial Sync
    syncPresets('request-overrides');

    // Filtering Pulse
    const filterBtns = document.querySelectorAll('.btn-filter');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const type = btn.dataset.type;
            const cards = document.querySelectorAll('.request-card');
            cards.forEach(card => {
                if (!type || type === 'all') {
                    card.style.display = 'block';
                } else if (type === 'rewrite') {
                    card.style.display = card.classList.contains('is-rewrite') ? 'block' : 'none';
                } else if (type === 'violation') {
                    card.style.display = card.classList.contains('has-violation') ? 'block' : 'none';
                }
            });
        });
    });

    // Real-time Feed via SSE
    const evtSource = new EventSource('/events');
    
    // Build Error Overlay (Vite-style)
    const buildErrorBanner = document.getElementById('build-error-banner');
    const buildErrorTitle  = document.getElementById('build-error-title');
    const buildErrorMsg    = document.getElementById('build-error-message');

    function showBuildError(payload) {
        const label = payload.type === 'cff' ? 'CloudFront Function' : 'Lambda@Edge';
        buildErrorTitle.textContent = `🛑 Build Failed — ${label}: ${payload.file.split(/[\\/]/).pop()}`;
        buildErrorMsg.textContent = payload.error;
        buildErrorBanner.style.display = 'flex';
    }

    function clearBuildError() {
        buildErrorBanner.style.display = 'none';
        buildErrorMsg.textContent = '';
    }

    // Dismiss on click (so user can inspect dashboard while broken)
    buildErrorBanner.addEventListener('click', (e) => {
        if (e.target === buildErrorBanner) clearBuildError();
    });

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
            portDisplay.textContent = data.port;
            
            // Dynamic Versioning
            const versionTag = document.querySelector('.version-tag');
            if (versionTag && data.version) {
                 versionTag.textContent = `Developer Edition v${data.version}`;
            }

            // Wipe all local state for a clean slate
            requestFeed.innerHTML = '<div class="empty-state"><p>Waiting for requests...</p></div>';
            loadHeaderState(data.headerState);
            
            // Reset "Dirty" state
            markClean();
            
            // Reset filters to "All"
            const allFilterBtn = document.querySelector('.btn-filter[data-type="all"]');
            if (allFilterBtn) {
                filterBtns.forEach(b => b.classList.remove('active'));
                allFilterBtn.classList.add('active');
            }
        } else if (data.type === 'request') {
            addRequestToFeed(data.request);
        } else if (data.type === 'build_error') {
            showBuildError(data.payload);
        } else if (data.type === 'build_success') {
            clearBuildError();
        }
    };

    evtSource.onerror = () => {
        console.error("SSE Connection lost.");
    };

    const sidebar = document.querySelector('.sidebar');
    const applyBtn = document.getElementById('apply-headers');
    let isDirty = false;

    function markDirty() {
        if (isDirty) return;
        isDirty = true;
        applyBtn.classList.add('dirty');
        applyBtn.innerText = 'Save Changes';
    }

    function markClean() {
        isDirty = false;
        applyBtn.classList.remove('dirty');
        applyBtn.innerText = 'Applied';
    }

    function checkDuplicates() {
        const reqKeys = Array.from(document.querySelectorAll('#req-header-list .hdr-key'));
        const resKeys = Array.from(document.querySelectorAll('#res-header-list .hdr-key'));
        
        let hasDuplicate = false;

        const validate = (inputs) => {
            const seen = new Set();
            inputs.forEach(input => {
                const val = input.value.trim().toLowerCase();
                input.classList.remove('input-duplicate');
                if (val && seen.has(val)) {
                    input.classList.add('input-duplicate');
                    hasDuplicate = true;
                }
                if (val) seen.add(val);
            });
        };

        validate(reqKeys);
        validate(resKeys);
        return hasDuplicate;
    }

    // Header Management
    function createHeaderRow(key = '', value = '', isDelete = false) {
        const row = document.createElement('div');
        row.className = 'header-row' + (isDelete ? ' suppressed' : '');
        row.innerHTML = `
            <div class="row-main">
                <input type="text" placeholder="Header Name" value="${key}" class="hdr-key">
                <input type="text" placeholder="Value" value="${value}" class="hdr-val" ${isDelete ? 'disabled' : ''}>
            </div>
            <div class="row-actions">
                <button class="btn-toggle-action ${isDelete ? '' : 'active'}" title="${isDelete ? 'Set: Override/Inject' : 'Suppress: Explicitly Delete'}">
                    <span class="material-icons">${isDelete ? 'do_not_disturb_on' : 'verified'}</span>
                </button>
                <button class="btn-remove" title="Remove"><span class="material-icons">delete</span></button>
            </div>
        `;

        const actionBtn = row.querySelector('.btn-toggle-action');
        const valInput = row.querySelector('.hdr-val');
        const keyInput = row.querySelector('.hdr-key');

        const handleChange = () => {
            markDirty();
            checkDuplicates();
        };
        keyInput.oninput = handleChange;
        valInput.oninput = handleChange;

        actionBtn.onclick = () => {
            const nowActive = actionBtn.classList.toggle('active');
            const isSuppressed = !nowActive;
            
            row.classList.toggle('suppressed', isSuppressed);
            actionBtn.title = isSuppressed ? 'Set: Override/Inject' : 'Suppress: Explicitly Delete';
            actionBtn.innerHTML = `<span class="material-icons">${isSuppressed ? 'do_not_disturb_on' : 'verified'}</span>`;
            valInput.disabled = isSuppressed;
            markDirty();
        };

        row.querySelector('.btn-remove').onclick = () => {
            row.remove();
            markDirty();
            checkDuplicates();
        };
        return row;
    }

    document.getElementById('add-req-header').onclick = () => {
        document.getElementById('req-header-list').appendChild(createHeaderRow());
        markDirty();
    };

    document.getElementById('add-res-header').onclick = () => {
        document.getElementById('res-header-list').appendChild(createHeaderRow());
        markDirty();
    };

    // Presets
    const DEVICE_HEADERS = [
        'CloudFront-Is-Mobile-Viewer',
        'CloudFront-Is-Tablet-Viewer',
        'CloudFront-Is-Desktop-Viewer',
        'CloudFront-Is-SmartTV-Viewer'
    ];

    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.onclick = () => {
            const listId = btn.dataset.type === 'request' ? 'req-header-list' : 'res-header-list';
            const list = document.getElementById(listId);
            const targetHeader = btn.dataset.header;
            const targetValue = btn.dataset.value;
            const isDevice = btn.dataset.group === 'device';

            // Device Radio Logic: If setting a device to true, others should be false/removed
            if (isDevice && targetValue === 'true') {
                DEVICE_HEADERS.forEach(h => {
                    if (h.toLowerCase() === targetHeader.toLowerCase()) return;
                    // Find and remove other device headers to simulate mutual exclusivity
                    const existing = Array.from(list.querySelectorAll('.header-row')).find(row => 
                        row.querySelector('.hdr-key').value.trim().toLowerCase() === h.toLowerCase());
                    if (existing) existing.remove();
                });
            }

            // Smart Upsert
            const existingRow = Array.from(list.querySelectorAll('.header-row')).find(row => 
                row.querySelector('.hdr-key').value.trim().toLowerCase() === targetHeader.toLowerCase());

            if (existingRow) {
                const valInput = existingRow.querySelector('.hdr-val');
                const actionBtn = existingRow.querySelector('.btn-toggle-action');
                
                // Update value
                valInput.value = targetValue;
                
                // Ensure it's active (not suppressed)
                if (existingRow.classList.contains('suppressed')) {
                    existingRow.classList.remove('suppressed');
                    actionBtn.classList.add('active');
                    actionBtn.innerHTML = '<span class="material-icons">verified</span>';
                    valInput.disabled = false;
                }

                // Visual Feedback
                existingRow.classList.remove('pulse-update');
                void existingRow.offsetWidth; // Trigger reflow
                existingRow.classList.add('pulse-update');
            } else {
                list.appendChild(createHeaderRow(targetHeader, targetValue));
            }
            
            markDirty();
            checkDuplicates();
        };
    });

    document.getElementById('reset-headers').onclick = () => {
         if (confirm('Reset all overrides to file defaults?')) {
             loadHeaderState({}); // We would fetch defaults if we had them saved, but for now we clear
             markDirty();
         }
    };

    // Save State
    applyBtn.onclick = async () => {
        const state = { request: {}, response: {} };
        let hasValidationError = false;
        const hasDuplicates = checkDuplicates();

        if (hasDuplicates) {
            applyBtn.innerText = '🛑 Duplicate Header Names';
            applyBtn.classList.add('error-pulse');
            setTimeout(() => {
                applyBtn.innerText = isDirty ? 'Save Changes' : 'Applied';
                applyBtn.classList.remove('error-pulse');
            }, 3000);
            return;
        }

        const collect = (listId, target) => {
            document.querySelectorAll(`#${listId} .header-row`).forEach(row => {
                const keyInput = row.querySelector('.hdr-key');
                const valInput = row.querySelector('.hdr-val');
                const k = keyInput.value.trim();
                const v = valInput.value.trim();
                const isSuppressed = row.classList.contains('suppressed');

                if (!k) {
                    keyInput.classList.add('input-error');
                    hasValidationError = true;
                    return; 
                }

                keyInput.classList.remove('input-error');
                target[k] = isSuppressed ? null : v;
            });
        };

        collect('req-header-list', state.request);
        collect('res-header-list', state.response);

        if (hasValidationError) {
            applyBtn.innerText = '🛑 Fix Missing Names';
            applyBtn.classList.add('error-pulse');
            setTimeout(() => {
                applyBtn.innerText = isDirty ? 'Save Changes' : 'Applied';
                applyBtn.classList.remove('error-pulse');
            }, 3000);
            return;
        }

        try {
            const res = await fetch('/headers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
            if (res.ok) {
                markClean();
                applyBtn.innerText = '✅ Applied';
                applyBtn.classList.add('success');
                setTimeout(() => {
                    applyBtn.innerText = 'Applied';
                    applyBtn.classList.remove('success');
                }, 2000);
            }
        } catch (err) {
            alert('🛑 Failed to save headers.');
        }
    };

    function loadHeaderState(state) {
        const reqList = document.getElementById('req-header-list');
        const resList = document.getElementById('res-header-list');
        reqList.innerHTML = '';
        resList.innerHTML = '';

        Object.entries(state.request || {}).forEach(([k, v]) => reqList.appendChild(createHeaderRow(k, v, v === null)));
        Object.entries(state.response || {}).forEach(([k, v]) => resList.appendChild(createHeaderRow(k, v, v === null)));
    }

    function addRequestToFeed(req) {
        if (document.querySelector('.empty-state')) {
            requestFeed.innerHTML = '';
        }

        const card = document.createElement('div');
        card.className = 'request-card';
        card.id = `req-${req.id}`;
        if (req.violation) card.classList.add('has-violation');
        if (req.steps && req.steps.length > 1) card.classList.add('is-rewrite');

        const statusClass = req.status >= 500 ? 'status-error' : (req.status >= 400 ? 'status-warn' : 'status-ok');
        
        card.innerHTML = `
            <div class="card-header">
                <div style="display: flex; align-items: center; gap: 0.75rem">
                    <span class="card-id">#${req.id.slice(0, 8)}</span>
                    <span class="card-method">${req.method}</span>
                    <span class="card-uri">${req.path}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem">
                    <span class="card-status ${statusClass}">${req.status}</span>
                    <span class="expand-icon">expand_more</span>
                </div>
            </div>
            <div class="card-body-mini">
                 <div class="rewrite-path">${req.steps.length > 1 ? `↳ ${req.steps[req.steps.length - 1].uri}` : ''}</div>
                 <div class="performance-mini">${req.cpu.toFixed(2)}ms</div>
            </div>
            <div class="card-details" style="display: none;">
                <div class="loading-spinner">Loading deep inspection data...</div>
            </div>
        `;

        card.querySelector('.expand-icon').onclick = (e) => {
            e.stopPropagation();
            toggleRequestDetails(req.id, card);
        };
        requestFeed.prepend(card);
        
        if (requestFeed.children.length > 50) {
            requestFeed.removeChild(requestFeed.lastChild);
        }
    }

    async function toggleRequestDetails(id, card) {
        const detailsEl = card.querySelector('.card-details');
        const iconEl = card.querySelector('.expand-icon');
        const isExpanded = detailsEl.style.display === 'block';

        if (isExpanded) {
            detailsEl.style.display = 'none';
            card.classList.remove('expanded');
            iconEl.innerText = 'expand_more';
            return;
        }

        detailsEl.style.display = 'block';
        card.classList.add('expanded');
        iconEl.innerText = 'expand_less';

        if (detailsEl.innerHTML.includes('Loading deep inspection data...')) {
            try {
                const res = await fetch(`/request/${id}`);
                const data = await res.json();
                renderDetails(detailsEl, data);
            } catch (err) {
                detailsEl.innerHTML = `<div class="error">Failed to load details: ${err.message}</div>`;
            }
        }
    }

    function renderDetails(el, data) {
        el.innerHTML = `
            <div class="detail-nav">
                <div class="nav-item active" data-pane="trace">Trace</div>
                <div class="nav-item" data-pane="headers">Headers</div>
                <div class="nav-item" data-pane="body">Body</div>
            </div>

            <div class="detail-pane active" id="pane-trace-${data.id}">
                <div class="detail-grid">
                    <div class="detail-section">
                        <h4>Pipeline Evolution</h4>
                        <div class="shadow-rewrite">
                            ${data.steps.map(s => `
                                <div class="step">
                                    <span>${s.uri}</span>
                                    <span class="step-label">${s.label}</span>
                                </div>
                            `).join('')}
                        </div>
                        ${data.violation ? `
                            <div class="fidelity-alert">
                                <span>🛑</span>
                                <div>
                                    <strong>Fidelity Violation:</strong> ${data.violation}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="detail-pane" id="pane-headers-${data.id}">
                <div class="header-lifecycle">
                    <div class="lifecycle-col">
                        <h5>Request lifecycle (Viewer → Origin)</h5>
                        <div class="header-diff">
                            ${renderHeaderDiff(data.headers.request.viewer, data.headers.request.origin)}
                        </div>
                    </div>
                    <div class="lifecycle-col">
                        <h5>Response lifecycle (Origin → Viewer)</h5>
                        <div class="header-diff">
                            ${renderHeaderDiff(data.headers.response.origin, data.headers.response.viewer)}
                        </div>
                    </div>
                </div>
            </div>

            <div class="detail-pane" id="pane-body-${data.id}">
                <div class="detail-section">
                    <h4>Body Snippet (First 1KB)</h4>
                    <pre class="body-snippet">${data.bodySnippet || '(No body content buffered)'}</pre>
                </div>
            </div>
        `;

        // Wire up internal tabs
        el.querySelectorAll('.nav-item').forEach(nav => {
            nav.onclick = (e) => {
                e.stopPropagation();
                el.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                el.querySelectorAll('.detail-pane').forEach(p => p.classList.remove('active'));
                
                nav.classList.add('active');
                el.querySelector(`#pane-${nav.dataset.pane}-${data.id}`).classList.add('active');
            };
        });
    }

    function renderHeaderDiff(incoming, final) {
        const allKeys = new Set([...Object.keys(incoming), ...Object.keys(final)]);
        let html = '<table class="diff-table">';
        
        [...allKeys].sort().forEach(key => {
            const val1 = incoming[key];
            const val2 = final[key];
            
            let rowClass = '';
            if (val1 === undefined) rowClass = 'h-added';
            else if (val2 === undefined) rowClass = 'h-removed';
            else if (JSON.stringify(val1) !== JSON.stringify(val2)) rowClass = 'h-modified';

            html += `
                <tr class="${rowClass}">
                    <td class="h-key">${key}</td>
                    <td class="h-val">${val2 !== undefined ? val2 : '<span class="deleted">REMOVED</span>'}</td>
                </tr>
            `;
        });
        
        return html + '</table>';
    }

    document.getElementById('clear-feed').onclick = () => {
        requestFeed.innerHTML = '<div class="empty-state"><p>Waiting for requests...</p></div>';
    };

    // About Modal Logic
    const aboutModal = document.getElementById('about-modal');
    const aboutTrigger = document.getElementById('about-trigger');
    const closeAbout = document.getElementById('close-about');

    const showAbout = () => {
        aboutModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    };

    const hideAbout = () => {
        aboutModal.classList.remove('active');
        document.body.style.overflow = '';
    };

    aboutTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        showAbout();
    });

    closeAbout.addEventListener('click', hideAbout);

    // Close on click outside
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            hideAbout();
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aboutModal.classList.contains('active')) {
            hideAbout();
        }
    });
});
