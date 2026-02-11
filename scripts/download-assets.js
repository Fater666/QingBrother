
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap';
const BG_IMAGE_URL = 'https://www.transparenttextures.com/patterns/p6.png';

const PUBLIC_DIR = path.join(__dirname, '../public');
const FONTS_DIR = path.join(PUBLIC_DIR, 'fonts/NotoSerifSC');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const FONT_CSS_FILE = path.join(PUBLIC_DIR, 'fonts/NotoSerifSC.css');

// Ensure directories exist
if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function fetchContent(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
                return;
            }
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {}); // Delete the file if error
            reject(err);
        });
    });
}

async function processFonts() {
    console.log('Fetching font CSS...');
    let css;
    try {
        css = await fetchContent(FONT_CSS_URL);
    } catch (e) {
        console.error('Failed to fetch font CSS:', e);
        return;
    }
    
    // Find all font URLs
    const fontUrls = [];
    const fontFiles = new Map(); // url -> filename

    // Simple regex to find url(...)
    const urlRegex = /src:\s*url\((https:\/\/[^)]+)\)/g;
    let match;
    let counter = 0;

    // Use a while loop with regex exec to find all matches
    while ((match = urlRegex.exec(css)) !== null) {
        const url = match[1];
        if (!fontFiles.has(url)) {
            // Generate a filename based on the URL or counter
            // The URL looks like .../v35/...woff2
            const ext = path.extname(new URL(url).pathname) || '.woff2';
            const filename = `noto-serif-sc-${counter++}${ext}`;
            fontFiles.set(url, filename);
            fontUrls.push({ url, filename });
        }
    }

    console.log(`Found ${fontUrls.length} font files.`);

    // Download fonts
    for (const { url, filename } of fontUrls) {
        const dest = path.join(FONTS_DIR, filename);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            console.log(`Skipping ${filename} (already exists)`);
            continue;
        }
        console.log(`Downloading ${filename}...`);
        try {
            await downloadFile(url, dest);
        } catch (e) {
            console.error(`Failed to download ${filename}:`, e);
        }
    }

    // Replace URLs in CSS
    // We need to replace the absolute URLs with relative paths to the local files
    // The CSS file will be at public/fonts/NotoSerifSC.css
    // The font files are at public/fonts/NotoSerifSC/*.woff2
    // So the path should be ./NotoSerifSC/*.woff2
    let localCss = css;
    for (const [url, filename] of fontFiles) {
        // use replaceAll if available or create a global regex
        // CSS URLs are unique strings in the file, so simple replace is fine
        // Using split/join for replaceAll behavior
        localCss = localCss.split(url).join(`./NotoSerifSC/${filename}`);
    }

    // Save CSS
    fs.writeFileSync(FONT_CSS_FILE, localCss);
    console.log(`Saved CSS to ${FONT_CSS_FILE}`);
}

async function processImages() {
    console.log('Downloading background image...');
    const filename = 'p6.png';
    const dest = path.join(IMAGES_DIR, filename);
    try {
        await downloadFile(BG_IMAGE_URL, dest);
        console.log(`Saved image to ${dest}`);
    } catch (e) {
        console.error('Failed to download background image:', e);
    }
}

async function main() {
    try {
        await processFonts();
        await processImages();
        console.log('All assets downloaded successfully.');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();
