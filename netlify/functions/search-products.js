const https = require('https');
const url = require('url');

exports.handler = async (event) => {
    // Handle both URL-encoded and decoded parameters
    let query = event.queryStringParameters?.query || event.query || '';
    
    // Decode if needed
    if (query) {
        try {
            query = decodeURIComponent(query);
        } catch (e) {
            // Already decoded
        }
    }
    
    query = query.trim();

    if (!query || query.length < 2) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Query must be at least 2 characters' })
        };
    }

    try {
        const apiUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&page_size=10&json=1`;

        // Use native https.get instead of fetch
        const data = await new Promise((resolve, reject) => {
            https.get(apiUrl, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Failed to parse JSON: ' + e.message));
                    }
                });
            }).on('error', reject);
        });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message || 'Unknown error' })
        };
    }
};
