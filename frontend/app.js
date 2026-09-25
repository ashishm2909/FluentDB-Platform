document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:5002/api';
    let chatHistory = [];
    let currentChart = null;
    let currentCsvData = null;
    let currentRenderedRowCount = 0;
    let totalRowsToRender = [];
    let currentColumns = [];

    // UI Elements
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('collapsed');
        });
        
        // Expand sidebar if clicked anywhere while collapsed
        sidebar.addEventListener('click', (e) => {
            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                e.preventDefault(); // Prevent accidental clicks on inner elements like links when expanding
            }
        });
    }

    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    
    // Load API key from local storage if exists
    const storedApiKey = localStorage.getItem('groqApiKey');
    if (storedApiKey) {
        apiKeyInput.value = storedApiKey;
    }
    
    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('groqApiKey', key);
            alert('API Key saved successfully!');
        } else {
            localStorage.removeItem('groqApiKey');
            alert('API Key removed.');
        }
    });

    const dbFileInput = document.getElementById('db-file');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');
    const dbSelect = document.getElementById('db-select');
    const refreshDbsBtn = document.getElementById('refresh-dbs-btn');
    const deleteDbBtn = document.getElementById('delete-db-btn');

    const queryInput = document.getElementById('query-input');
    const submitBtn = document.getElementById('submit-btn');
    
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const resultsArea = document.getElementById('results-area');
    
    const insightsCard = document.getElementById('insights-card');
    const insightText = document.getElementById('insight-text');
    const chartCard = document.getElementById('chart-card');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    fetchDatabases();
    
    refreshDbsBtn.addEventListener('click', fetchDatabases);
    
    const customModal = document.getElementById('custom-modal');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    let dbToDelete = null;

    deleteDbBtn.addEventListener('click', () => {
        dbToDelete = dbSelect.value;
        if (!dbToDelete) return alert("No database selected to delete.");
        customModal.classList.remove('hidden');
    });

    modalCancelBtn.addEventListener('click', () => {
        customModal.classList.add('hidden');
        dbToDelete = null;
    });

    modalConfirmBtn.addEventListener('click', async () => {
        customModal.classList.add('hidden');
        if (!dbToDelete) return;
        
        try {
            const res = await fetch(`${API_BASE}/database/${dbToDelete}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchDatabases();
            } else {
                alert(data.error);
            }
        } catch (e) {
            alert("Failed to delete database.");
        }
        dbToDelete = null;
    });
    // Removed duplicate UI variables

    dbFileInput.addEventListener('change', (e) => { 
        document.getElementById('selected-filename').textContent = e.target.files[0]?.name || 'No file selected'; 
    });

    // Drag and Drop Logic
    const dropZone = document.getElementById('drop-zone');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });
    
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            dbFileInput.files = files;
            document.getElementById('selected-filename').textContent = files[0].name;
        }
    });

    uploadBtn.addEventListener('click', () => {
        const file = dbFileInput.files[0];
        if (!file) return;
        
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        
        const formData = new FormData();
        formData.append('file', file);
        uploadStatus.textContent = "Uploading...";
        uploadBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload`, true);
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progressBar.style.width = percent + '%';
            }
        };
        
        xhr.onload = async () => {
            uploadBtn.disabled = false;
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                uploadStatus.textContent = "Success!";
                uploadStatus.className = "status-msg success";
                await fetchDatabases();
                dbSelect.value = data.filename;
                setTimeout(() => progressContainer.classList.add('hidden'), 2000);
            } else {
                try {
                    const errData = JSON.parse(xhr.responseText);
                    uploadStatus.textContent = errData.error;
                } catch(err) {
                    uploadStatus.textContent = "Upload failed.";
                }
                uploadStatus.className = "status-msg error";
                progressContainer.classList.add('hidden');
            }
        };
        
        xhr.onerror = () => {
            uploadBtn.disabled = false;
            uploadStatus.textContent = "Network error occurred.";
            uploadStatus.className = "status-msg error";
            progressContainer.classList.add('hidden');
        };
        
        xhr.send(formData);
    });

    async function fetchDatabases() {
        const res = await fetch(`${API_BASE}/databases`);
        const data = await res.json();
        dbSelect.innerHTML = '';
        (data.databases || []).forEach(db => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = db;
            dbSelect.appendChild(opt);
        });
    }

    refreshDbsBtn.addEventListener('click', fetchDatabases);

    async function handleQuery() {
        const query = queryInput.value.trim();
        const selectedDb = dbSelect.value;
        if (!selectedDb || !query) return;

        // Reset UI
        errorMessage.classList.add('hidden');
        resultsArea.classList.add('hidden');
        insightsCard.classList.add('hidden');
        chartCard.classList.add('hidden');
        document.getElementById('metrics-dashboard').classList.add('hidden');
        loading.classList.remove('hidden');
        submitBtn.disabled = true;

        try {
            // STEP 1: Generate SQL
            let sqlQuery, aiMetrics, complexity;
            const currentApiKey = localStorage.getItem('groqApiKey') || '';
            const genRes = await fetch(`${API_BASE}/generate_sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database: selectedDb, query, history: chatHistory, api_key: currentApiKey })
            });
            const genData = await genRes.json();
            if (!genRes.ok) throw new Error(genData.error);
            sqlQuery = genData.sql_query;
            aiMetrics = genData.ai_metrics;
            complexity = genData.complexity;

            // Show SQL immediately even if execution is blocked or safety check fails
            // Removed old assignment
            resultsArea.classList.remove('hidden');

            // STEP 1.5: Safety Checks
            const sqlUpper = sqlQuery.toUpperCase();
            // Forcefully render text to the UI to bypass any CSS bugs using bulletproof textarea
            const sqlCodeBox = document.getElementById('sql-code-box');
            sqlCodeBox.value = sqlQuery || "ERROR: LLM RETURNED EMPTY STRING";
            resultsArea.classList.remove('hidden');
            
            const isDeleteDrop = sqlUpper.includes('DELETE') || sqlUpper.includes('DROP');
            const isUpdateInsert = sqlUpper.includes('UPDATE') || sqlUpper.includes('INSERT');

            if (isDeleteDrop) {
                const confText = prompt(`WARNING: Destructive query detected!\n\n${sqlQuery}\n\nTo proceed, type exactly: I want to delete`);
                if (confText !== 'I want to delete') {
                    showError("Operation cancelled by user. Query will not execute.");
                    loading.classList.add('hidden');
                    submitBtn.disabled = false;
                    return;
                }
            } else if (isUpdateInsert) {
                const isConfirmed = confirm(`This query will modify the database:\n\n${sqlQuery}\n\nDo you want to continue?`);
                if (!isConfirmed) {
                    showError("Operation cancelled by user. Query will not execute.");
                    loading.classList.add('hidden');
                    submitBtn.disabled = false;
                    return;
                }
            }

            // STEP 2: Execute SQL (with Auto-Healing)
            let execRes = await fetch(`${API_BASE}/execute_sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database: selectedDb, sql_query: sqlQuery })
            });
            let execData = await execRes.json();

            // HEALING LOGIC
            if (!execRes.ok || execData.result.error) {
                const errorMsg = execData.error || execData.result.error;
                
                // DO NOT auto-heal if the table is missing, otherwise the LLM will hallucinate a wrong table
                if (errorMsg.toLowerCase().includes("no such table")) {
                    throw new Error(errorMsg);
                }
                
                console.log("SQL Failed. Attempting Auto-Heal...", errorMsg);
                
                const currentApiKey = localStorage.getItem('groqApiKey') || '';
                const healRes = await fetch(`${API_BASE}/heal_sql`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ database: selectedDb, query, wrong_sql: sqlQuery, error_msg: errorMsg, api_key: currentApiKey })
                });
                const healData = await healRes.json();
                if (!healRes.ok) throw new Error("Auto-Heal Failed: " + healData.error);
                
                sqlQuery = healData.fixed_sql;
                console.log("Healed SQL:", sqlQuery);

                // Re-execute healed SQL
                execRes = await fetch(`${API_BASE}/execute_sql`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ database: selectedDb, sql_query: sqlQuery })
                });
                execData = await execRes.json();
                if (!execRes.ok || execData.result.error) throw new Error("Healed SQL also failed: " + (execData.error || execData.result.error));
            }

            // Save to memory
            chatHistory.push({ user: query, sql: sqlQuery });
            if (chatHistory.length > 5) chatHistory.shift();

            // Display Base Results
            document.getElementById('results-title').textContent = `Query Results (${selectedDb})`;
            resultsArea.classList.remove('hidden');
            loading.classList.add('hidden');
            renderTable(execData.result.columns, execData.result.rows, execData.op_type);

            const source = genData.source || "LLM";
            let cost = 0.0;
            if (source === "LLM") {
                cost = ((aiMetrics.prompt_tokens / 1000) * 0.0005) + ((aiMetrics.completion_tokens / 1000) * 0.0015);
            }

            // Populate Metrics
            document.getElementById('val-ai-latency').textContent = (aiMetrics.inference_latency_ms || 0) + 'ms';
            document.getElementById('val-db-latency').textContent = (execData.result.exec_time_ms || 0) + 'ms';
            document.getElementById('val-tokens').textContent = `${aiMetrics.prompt_tokens} / ${aiMetrics.completion_tokens}`;
            const compEl = document.getElementById('val-complexity');
            compEl.textContent = complexity;
            compEl.style.color = complexity === 'High' ? '#ef4444' : (complexity === 'Medium' ? '#ffbd2e' : '#10b981');
            
            const costEl = document.getElementById('val-cost');
            costEl.textContent = `${source} ($${cost.toFixed(4)})`;
            costEl.style.color = source === 'CACHE' ? '#10b981' : '#a5b4fc';
            
            document.getElementById('metrics-dashboard').classList.remove('hidden');
            
            const finalStatus = (execData && execData.result && !execData.result.error) ? 'SUCCESS' : 'ERROR';
            
            // Log Query silently
            fetch(`${API_BASE}/log_query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    database: selectedDb, user_query: query, sql_query: sqlQuery,
                    ai_latency: aiMetrics.inference_latency_ms, db_latency: execData.result.exec_time_ms,
                    prompt_tokens: aiMetrics.prompt_tokens, completion_tokens: aiMetrics.completion_tokens,
                    complexity: complexity, status: finalStatus, source: source, cost: cost
                })
            }).catch(e => console.error("Logging failed", e));

            // Save CSV Data
            if (execData.result.rows.length > 0) {
                currentCsvData = { cols: execData.result.columns, rows: execData.result.rows };
            } else {
                currentCsvData = null;
            }

            // Auto Visualization (if 2 columns: string and number)
            if (execData.result.columns.length === 2 && execData.result.rows.length > 0) {
                const isNum0 = typeof execData.result.rows[0][0] === 'number';
                const isNum1 = typeof execData.result.rows[0][1] === 'number';
                if ((isNum0 && !isNum1) || (!isNum0 && isNum1)) {
                    const chartRows = execData.result.rows.slice(0, 50);
                    renderChart(execData.result.columns, chartRows, isNum1 ? 0 : 1, isNum1 ? 1 : 0);
                }
            }

            // Natural Language Insights
            if (execData.op_type === 'SELECT' && execData.result.rows.length > 0) {
                const currentApiKey = localStorage.getItem('groqApiKey') || '';
                fetch(`${API_BASE}/insights`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, data: { cols: execData.result.columns, rows: execData.result.rows.slice(0, 10) }, api_key: currentApiKey })
                }).then(r => r.json()).then(d => {
                    if (d.insight) {
                        insightText.textContent = d.insight;
                        insightsCard.classList.remove('hidden');
                    }
                });
            }

        } catch (error) {
            loading.classList.add('hidden');
            showError(error.message);
        } finally {
            submitBtn.disabled = false;
        }
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    let originalRowsData = [];

    function renderTable(columns, rows, opType) {
        tableHead.innerHTML = ''; tableBody.innerHTML = '';
        currentRenderedRowCount = 0;
        
        if (opType !== 'SELECT') {
            tableBody.innerHTML = `<tr><td colspan="100%" style="color: var(--success);">Success: Operation '${opType}' completed on the database.</td></tr>`;
            return;
        }
        if (!columns || !columns.length) {
            tableBody.innerHTML = '<tr><td colspan="100%">No data returned.</td></tr>';
            return;
        }
        const headerRow = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th'); th.textContent = col; headerRow.appendChild(th);
        });
        tableHead.appendChild(headerRow);

        currentColumns = columns;
        originalRowsData = rows;
        totalRowsToRender = rows;
        
        renderMoreRows(100);
    }

    const resultsSearchInput = document.getElementById('results-search-input');
    if (resultsSearchInput) {
        resultsSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            if (!term) {
                totalRowsToRender = originalRowsData;
            } else {
                totalRowsToRender = originalRowsData.filter(row => 
                    row.some(cellValue => cellValue !== null && String(cellValue).toLowerCase().includes(term))
                );
            }
            tableBody.innerHTML = '';
            currentRenderedRowCount = 0;
            renderMoreRows(100);
        });
    }

    function renderMoreRows(count) {
        if (currentRenderedRowCount >= totalRowsToRender.length) return;
        
        const endIdx = Math.min(currentRenderedRowCount + count, totalRowsToRender.length);
        const rowsToRender = totalRowsToRender.slice(currentRenderedRowCount, endIdx);
        
        const lastRow = tableBody.lastElementChild;
        if (lastRow && lastRow.classList.contains('status-row')) {
            tableBody.removeChild(lastRow);
        }
        
        rowsToRender.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cellValue => {
                const td = document.createElement('td'); 
                td.textContent = cellValue !== null ? cellValue : 'NULL'; 
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
        
        currentRenderedRowCount = endIdx;
        
        if (currentRenderedRowCount < totalRowsToRender.length) {
            const tr = document.createElement('tr');
            tr.className = 'status-row';
            const td = document.createElement('td');
            td.colSpan = currentColumns.length;
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-secondary)';
            td.style.padding = '1rem';
            td.textContent = `Showing ${currentRenderedRowCount} of ${totalRowsToRender.length} rows. Scroll down to load more...`;
            tr.appendChild(td);
            tableBody.appendChild(tr);
        }
    }

    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.addEventListener('scroll', () => {
            if (tableContainer.scrollTop + tableContainer.clientHeight >= tableContainer.scrollHeight - 50) {
                if (currentRenderedRowCount < totalRowsToRender.length) {
                    renderMoreRows(50);
                }
            }
        });
    }

    function renderChart(cols, rows, labelIdx, dataIdx) {
        chartCard.classList.remove('hidden');
        const ctx = document.getElementById('autoChart').getContext('2d');
        if (currentChart) currentChart.destroy();
        
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: rows.map(r => r[labelIdx]),
                datasets: [{
                    label: cols[dataIdx],
                    data: rows.map(r => r[dataIdx]),
                    backgroundColor: 'rgba(139, 92, 246, 0.5)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    exportCsvBtn.addEventListener('click', () => {
        if (!currentCsvData) {
            alert("No data available to export.");
            return;
        }
        const csvContent = [
            currentCsvData.cols.join(','),
            ...currentCsvData.rows.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'query_results.csv';
        a.click();
    });

    submitBtn.addEventListener('click', handleQuery);
    queryInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleQuery(); });

    // Metrics Modal Logic
    const metricsModal = document.getElementById('metrics-modal');
    const viewMetricsBtn = document.getElementById('view-metrics-btn');
    const closeMetricsBtn = document.getElementById('close-metrics-btn');
    
    if (viewMetricsBtn && metricsModal && closeMetricsBtn) {
        closeMetricsBtn.addEventListener('click', () => {
            metricsModal.classList.add('hidden');
        });
        
        viewMetricsBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            metricsModal.classList.remove('hidden');
            
            try {
                const response = await fetch(`${API_BASE}/logs`);
                const data = await response.json();
                
                if (data.logs) {
                    const logs = data.logs;
                    
                    document.getElementById('metrics-total-queries').textContent = logs.length;
                    
                    let totalAi = 0, totalDb = 0, totalTokens = 0, totalCost = 0.0, cacheHits = 0;
                    logs.forEach(log => {
                        totalAi += log.ai_latency || 0;
                        totalDb += log.db_latency || 0;
                        totalTokens += (log.prompt_tokens || 0) + (log.completion_tokens || 0);
                        totalCost += log.cost || 0.0;
                        if (log.source === 'CACHE') cacheHits++;
                    });
                    
                    if (logs.length > 0) {
                        document.getElementById('metrics-avg-ai').textContent = Math.round(totalAi / logs.length) + 'ms';
                        document.getElementById('metrics-total-cost').textContent = '$' + totalCost.toFixed(4);
                        document.getElementById('metrics-cache-saved').textContent = cacheHits;
                    }
                    
                    const tbody = document.getElementById('metrics-logs-body');
                    const itemsPerPage = 10;
                    let currentPage = 1;
                    let filteredLogs = logs;
                    
                    const searchInput = document.getElementById('metrics-search-input');
                    if (searchInput) {
                        searchInput.value = ''; // Reset on open
                        searchInput.addEventListener('input', (e) => {
                            const term = e.target.value.toLowerCase();
                            filteredLogs = logs.filter(l => 
                                (l.user_query && l.user_query.toLowerCase().includes(term)) ||
                                (l.sql_query && l.sql_query.toLowerCase().includes(term)) ||
                                (l.database && l.database.toLowerCase().includes(term)) ||
                                (l.source && l.source.toLowerCase().includes(term))
                            );
                            currentPage = 1;
                            renderTable(currentPage);
                        });
                    }
                    
                    function renderTable(page) {
                        tbody.innerHTML = '';
                        const start = (page - 1) * itemsPerPage;
                        const end = start + itemsPerPage;
                        const paginatedLogs = filteredLogs.slice(start, end);
                        
                        paginatedLogs.forEach((log, index) => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${start + index + 1}</td>
                                <td>${new Date(log.timestamp).toLocaleString()}</td>
                                <td>${log.database}</td>
                                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.user_query}">${log.user_query}</td>
                                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace;" title="${log.sql_query}">${log.sql_query}</td>
                                <td style="font-weight: bold; color: ${log.source === 'CACHE' ? '#10b981' : '#a5b4fc'}">${log.source || 'LLM'}</td>
                                <td>$${(log.cost || 0).toFixed(4)}</td>
                                <td>${(log.prompt_tokens || 0) + (log.completion_tokens || 0)}</td>
                            `;
                            tbody.appendChild(tr);
                        });
                        
                        document.getElementById('metrics-page-indicator').textContent = `Page ${page} of ${Math.ceil(filteredLogs.length / itemsPerPage) || 1}`;
                        document.getElementById('metrics-prev-btn').disabled = page === 1;
                        document.getElementById('metrics-next-btn').disabled = end >= filteredLogs.length;
                    }
                    
                    document.getElementById('metrics-prev-btn').onclick = () => { if (currentPage > 1) renderTable(--currentPage); };
                    document.getElementById('metrics-next-btn').onclick = () => { if ((currentPage * itemsPerPage) < filteredLogs.length) renderTable(++currentPage); };
                    
                    renderTable(currentPage);
                }
            } catch (e) {
                console.error("Failed to load metrics", e);
            }
        });
    }
});
