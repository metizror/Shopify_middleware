require("dotenv").config();
const axios = require("axios");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function inspectFirstProduct() {
    const query = `
    query {
      getSystemMetalListing(first: 1) {
        edges {
          node {
            name
            images {
              image {
                ... on asset {
                  fullpath
                }
              }
            }
            image_sds {
              image {
                ... on asset {
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
        const response = await axios.post(
            process.env.GRAPHQL_API_URL,
            { query },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": process.env.EOS_API_KEY,
                    "Authorization": process.env.EOS_AUTH_BASIC
                }
            }
        );

        console.log("GraphQL Response Structure (First Product):");
        const node = response.data.data.getSystemMetalListing.edges[0]?.node;
        if (node) {
            console.log(JSON.stringify(node, null, 2));

            console.log("\nTesting Image Accessibility:");
            const images = [];
            if (node.images) {
                const imgSets = Array.isArray(node.images) ? node.images : [node.images];
                imgSets.forEach(s => {
                    if (s.image && s.image.fullpath) images.push(`https://staging.eos.info${s.image.fullpath}`);
                });
            }
            if (node.image_sds) {
                const sdsSets = Array.isArray(node.image_sds) ? node.image_sds : [node.image_sds];
                sdsSets.forEach(s => {
                    if (s.image && s.image.fullpath) images.push(`https://staging.eos.info${s.image.fullpath}`);
                });
            }

            for (const url of images) {
                try {
                    console.log(`Checking URL: ${url}`);
                    const head = await axios.head(url, { timeout: 5000 });
                    console.log(`✅ Accessible! Status: ${head.status}`);
                } catch (e) {
                    console.error(`❌ Inaccessible: ${e.message}`);
                    if (e.response) {
                        console.error(`Status: ${e.response.status}`);
                        if (e.response.status === 401) {
                            console.error("Authentication required for image URL.");
                        }
                    }
                }
            }
        } else {
            console.log("No product found.");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

inspectFirstProduct();
