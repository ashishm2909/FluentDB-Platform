document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = 'http://localhost:5002/api';

    try {
        const response = await fetch(`${API_BASE}/logs`);
        const data = await response.json();
        
        if (data.logs) {
            const logs = data.logs;
            
            // Calculate Aggregates
            document.getElementById('total-queries').textContent = logs.length;
            
            let totalAi = 0;
            let totalDb = 0;
            let totalTokens = 0;
            let totalCost = 0.0;
            let cacheHits = 0;

            logs.forEach(log => {
                totalAi += log.ai_latency || 0;
                totalDb += log.db_latency || 0;
                totalTokens += (log.prompt_tokens || 0) + (log.completion_tokens || 0);
                totalCost += log.cost || 0.0;
                if (log.source === 'CACHE') cacheHits++;
            });

            if (logs.length > 0) {
                document.getElementById('avg-ai').textContent = Math.round(totalAi / logs.length) + 'ms';
                document.getElementById('total-cost').textContent = '$' + totalCost.toFixed(4);
                document.getElementById('cache-saved').textContent = cacheHits;
            }

            const tbody = document.getElementById('logs-body');
            const itemsPerPage = 30;
            let currentPage = 1;

            function renderTable(page) {
                tbody.innerHTML = '';
                const start = (page - 1) * itemsPerPage;
                const end = start + itemsPerPage;
                const paginatedLogs = logs.slice(start, end);

                paginatedLogs.forEach((log, index) => {
                    const rowNum = start + index + 1;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${rowNum}</td>
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

                document.getElementById('page-indicator').textContent = `Page ${page} of ${Math.ceil(logs.length / itemsPerPage) || 1}`;
                document.getElementById('prev-btn').disabled = page === 1;
                document.getElementById('next-btn').disabled = end >= logs.length;
            }

            document.getElementById('prev-btn').addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable(currentPage);
                }
            });

            document.getElementById('next-btn').addEventListener('click', () => {
                if ((currentPage * itemsPerPage) < logs.length) {
                    currentPage++;
                    renderTable(currentPage);
                }
            });

            renderTable(currentPage);
        }
    } catch (e) {
        console.error("Failed to load metrics", e);
    }
});
