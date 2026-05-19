const https = require('https');

exports.handler = async (event) => {
    const { query } = event.queryStringParameters || {};

    if (!query || query.length < 2) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Query must be at least 2 characters' })
        };
    }

    try {
        const apiUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&page_size=10&json=1`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        
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
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};
