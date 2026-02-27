require("dotenv").config();
const axios = require("axios");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function debugImages() {
    const query = `
    query {
      getSystemMetalListing(first: 2) {
        edges {
          node {
            name
            images {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
            image_sds {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
          }
        }
      }
    }
    `;

    try {
        console.log("📡 Fetching from EOS GraphQL...");
        const response = await axios.post(
            process.env.GRAPHQL_API_URL,
            { query },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": process.env.EOS_API_KEY,
                    "Authorization": process.env.EOS_AUTH_BASIC
                },
                timeout: 30000
            }
        );

        console.log("GraphQL Response received.");
        if (response.data.errors) {
            console.error("GraphQL Errors:", JSON.stringify(response.data.errors, null, 2));
        }

        const data = response.data.data;
        if (!data || !data.getSystemMetalListing) {
            console.log("No data returned for Metal Listing.");
            console.log("Full data:", JSON.stringify(data, null, 2));
            return;
        }
        const products = data.getSystemMetalListing.edges;
        console.log(`📦 Found ${products.length} products.\n`);

        products.forEach((edge, pIdx) => {
            const product = edge.node;
            console.log(`Product [${pIdx}]: ${product.name}`);

            // Raw data check
            console.log("   Raw images field:", JSON.stringify(product.images));
            console.log("   Raw image_sds field:", JSON.stringify(product.image_sds));

            // Mapping Logic Simulation
            const images = [];
            if (product.images) {
                const imgSets = Array.isArray(product.images) ? product.images : [product.images];
                imgSets.forEach(imgSet => {
                    if (imgSet && imgSet.image && imgSet.image.fullpath) {
                        images.push({ src: `https://staging.eos.info${imgSet.image.fullpath}` });
                    }
                });
            }

            if (product.image_sds) {
                const sdsSets = Array.isArray(product.image_sds) ? product.image_sds : [product.image_sds];
                sdsSets.forEach(imgSet => {
                    if (imgSet && imgSet.image && imgSet.image.fullpath) {
                        images.push({ src: `https://staging.eos.info${imgSet.image.fullpath}` });
                    }
                });
            }

            console.log(`   Mapped ${images.length} images:`);
            images.forEach((img, idx) => console.log(`      [${idx}]: ${img.src}`));
            console.log("----------------------------------\n");
        });

    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
    }
}

debugImages();
