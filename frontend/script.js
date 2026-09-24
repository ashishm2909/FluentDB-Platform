document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:5001/api';
    let chatHistory = [];
    let currentChart = null;
    let currentCsvData = null;

    // UI Elements
    const dbFileInput = document.getElementById('db-file');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');
    const dbSelect = document.getElementById('db-select');
    const refreshDbsBtn = document.getElementById('refresh-dbs-btn');

    const queryInput = document.getElementById('query-input');
    const submitBtn = document.getElementById('submit-btn');
    
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const sqlCode = document.getElementById('sql-code');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const resultsArea = document.getElementById('results-area');
    
    const insightsCard = document.getElementById('insights-card');
    const insightText = document.getElementById('insight-text');
    const chartCard = document.getElementById('chart-card');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    fetchDatabases();

    uploadBtn.addEventListener('click', async () => {
        const file = dbFileInput.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        uploadStatus.textContent = "Uploading...";
        uploadBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) {
                uploadStatus.textContent = "Success!";
                uploadStatus.className = "status-msg success";
                await fetchDatabases();
                dbSelect.value = data.filename;
            } else throw new Error(data.error);
        } catch (e) {
            uploadStatus.textContent = e.message;
            uploadStatus.className = "status-msg error";
        } finally { uploadBtn.disabled = false; }
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
            const genRes = await fetch(`${API_BASE}/generate_sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database: selectedDb, query, history: chatHistory })
            });
            const genData = await genRes.json();
            if (!genRes.ok) throw new Error(genData.error);
            sqlQuery = genData.sql_query;
            aiMetrics = genData.ai_metrics;
            complexity = genData.complexity;

            // Show SQL immediately even if execution is blocked or safety check fails
            sqlCode.textContent = sqlQuery;
            resultsArea.classList.remove('hidden');

            // STEP 1.5: Safety Checks
            const sqlUpper = sqlQuery.toUpperCase();
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
                console.log("SQL Failed. Attempting Auto-Heal...", errorMsg);
                
                const healRes = await fetch(`${API_BASE}/heal_sql`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ database: selectedDb, query, wrong_sql: sqlQuery, error_msg: errorMsg })
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
            sqlCode.textContent = sqlQuery;
            resultsArea.classList.remove('hidden');
            loading.classList.add('hidden');
            renderTable(execData.result.columns, execData.result.rows, execData.op_type);

            // Populate Metrics
            document.getElementById('val-ai-latency').textContent = (aiMetrics.inference_latency_ms || 0) + 'ms';
            document.getElementById('val-db-latency').textContent = (execData.result.exec_time_ms || 0) + 'ms';
            document.getElementById('val-tokens').textContent = `${aiMetrics.prompt_tokens} / ${aiMetrics.completion_tokens}`;
            const compEl = document.getElementById('val-complexity');
            compEl.textContent = complexity;
            compEl.style.color = complexity === 'High' ? '#ef4444' : (complexity === 'Medium' ? '#ffbd2e' : '#10b981');
            document.getElementById('metrics-dashboard').classList.remove('hidden');

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
                    renderChart(execData.result.columns, execData.result.rows, isNum1 ? 0 : 1, isNum1 ? 1 : 0);
                }
            }

            // Natural Language Insights
            if (execData.op_type === 'SELECT' && execData.result.rows.length > 0) {
                fetch(`${API_BASE}/insights`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, data: { cols: execData.result.columns, rows: execData.result.rows.slice(0, 10) } })
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

    function renderTable(columns, rows, opType) {
        tableHead.innerHTML = ''; tableBody.innerHTML = '';
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

        rows.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cellValue => {
                const td = document.createElement('td'); td.textContent = cellValue !== null ? cellValue : 'NULL'; tr.appendChild(td);
            });
            tableBody.appendChild(tr);
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
});
