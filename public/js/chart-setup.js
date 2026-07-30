// Setup Chart.js with global defaults for dark theme
Chart.defaults.color = '#8b9bb4';
Chart.defaults.font.family = 'Inter';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.elements.line.tension = 0.4;
Chart.defaults.elements.point.radius = 0; // Hide points for performance
Chart.defaults.animation = false; // We handle batch updates

export function initCryptoChart(ctx) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'BTC',
                    borderColor: '#ffaa00',
                    backgroundColor: 'rgba(255, 170, 0, 0.1)',
                    fill: true,
                    data: []
                },
                {
                    label: 'ETH',
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    data: []
                },
                {
                    label: 'SOL',
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    fill: true,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: false // Hide x-axis labels for clean streaming look
                },
                y: {
                    position: 'right',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end' },
                tooltip: { mode: 'index', intersect: false }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

export function initIotChart(ctx) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temp (°C)',
                    borderColor: '#ff3366',
                    data: []
                },
                {
                    label: 'Humidity (%)',
                    borderColor: '#00d4ff',
                    data: []
                },
                {
                    label: 'CPU (%)',
                    borderColor: '#00ff88',
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: { min: 0, max: 100 }
            },
            plugins: {
                legend: { position: 'top', align: 'end' }
            }
        }
    });
}

export function updateChartData(chart, label, dataArr, maxPoints = 50) {
    chart.data.labels.push(label);
    chart.data.datasets.forEach((dataset, i) => {
        dataset.data.push(dataArr[i]);
    });
    
    if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets.forEach((dataset) => {
            dataset.data.shift();
        });
    }
}
