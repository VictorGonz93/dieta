const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8000;

function fetchOFF(searchQuery) {
    return new Promise((resolve, reject) => {
        const apiUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&page_size=20&json=1`;
        console.log(`Fetching: ${apiUrl}`);
        
        https.get(apiUrl, { timeout: 10000 }, (res) => {
            console.log(`Response status: ${res.statusCode}`);
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    console.log(`Got ${data.products?.length || 0} products from API`);
                    resolve(data);
                } catch (e) {
                    console.error(`JSON parse error: ${e.message}`);
                    console.error(`Body preview: ${body.substring(0, 200)}`);
                    reject(new Error(`Invalid JSON: ${e.message}`));
                }
            });
        }).on('error', (err) => {
            console.error(`HTTPS error: ${err.message}`);
            reject(err);
        }).on('timeout', () => {
            console.error('Request timeout');
            reject(new Error('Request timeout'));
        });
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    try {
        if (pathname === '/api/search') {
            const searchTerm = query.q || query.query || '';
            
            if (!searchTerm || searchTerm.length < 2) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Search query must be at least 2 characters' }));
                return;
            }

            console.log(`\n🔍 Searching for: "${searchTerm}"`);
            const data = await fetchOFF(searchTerm);
            
            const validProducts = (data.products || []).filter(p => 
                p.nutriments && 
                typeof p.nutriments.energy_kcal === 'number' &&
                typeof p.nutriments.proteins === 'number' &&
                typeof p.nutriments.carbohydrates === 'number' &&
                typeof p.nutriments.fat === 'number'
            );

            console.log(`✅ Found ${validProducts.length} valid products out of ${data.products?.length || 0}`);

            res.writeHead(200);
            res.end(JSON.stringify({
                query: searchTerm,
                count: validProducts.length,
                products: validProducts.slice(0, 10).map(p => ({
                    name: p.product_name || p.name || 'Unknown',
                    brand: p.brands || 'Unknown',
                    kcal: Math.round(p.nutriments.energy_kcal),
                    protein: parseFloat(p.nutriments.proteins.toFixed(1)),
                    carbs: parseFloat(p.nutriments.carbohydrates.toFixed(1)),
                    fats: parseFloat(p.nutriments.fat.toFixed(1))
                }))
            }));
        } else if (pathname === '/') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                message: 'OpenFoodFacts Proxy Server',
                endpoints: { search: '/api/search?q=pollo' }
            }));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Proxy server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/search?q=pollo\n`);
});

server.listen(PORT, () => {
    console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/search?q=pollo`);
});
