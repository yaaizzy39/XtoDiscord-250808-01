// Discord API 関連のユーティリティ関数
// 注意: content.jsで直接実装されているため、このファイルは将来の拡張用として保持

/**
 * Discord Webhook URLの形式を検証
 * @param {string} url - 検証するURL
 * @returns {boolean} 有効かどうか
 */
function validateDiscordWebhookUrl(url) {
    try {
        const urlObj = new URL(url);
        return (urlObj.hostname === 'discord.com' || urlObj.hostname === 'discordapp.com') &&
               urlObj.pathname.includes('/api/webhooks/');
    } catch {
        return false;
    }
}

/**
 * Discord Embedオブジェクトを作成
 * @param {Object} postData - ポストデータ
 * @returns {Object} Discord embed オブジェクト
 */
function createDiscordEmbed(postData) {
    return {
        title: "New X Post Shared",
        description: postData.text || "テキストなし",
        url: postData.postUrl || "",
        author: {
            name: postData.username || "Unknown User",
            url: postData.userHandle ? `https://x.com/${postData.userHandle}` : undefined
        },
        footer: {
            text: "Shared via Chrome Extension"
        },
        timestamp: new Date().toISOString(),
        color: 0x1DA1F2 // Twitter blue
    };
}

/**
 * Discord Webhookにメッセージを送信
 * @param {string} webhookUrl - Webhook URL
 * @param {Object} postData - 送信するポストデータ
 * @returns {Promise} 送信結果
 */
async function sendDiscordWebhook(webhookUrl, postData) {
    const payload = {
        embeds: [createDiscordEmbed(postData)]
    };
    
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`Discord API Error: ${response.status} ${response.statusText}`);
    }
    
    return response;
}

/**
 * レート制限を考慮した送信関数
 * @param {string} webhookUrl - Webhook URL
 * @param {Object} postData - 送信するポストデータ
 * @param {number} retryCount - リトライ回数
 * @returns {Promise} 送信結果
 */
async function sendWithRetry(webhookUrl, postData, retryCount = 3) {
    for (let i = 0; i < retryCount; i++) {
        try {
            return await sendDiscordWebhook(webhookUrl, postData);
        } catch (error) {
            if (error.message.includes('429') && i < retryCount - 1) {
                // レート制限の場合は待機してリトライ
                const waitTime = Math.pow(2, i) * 1000; // 指数バックオフ
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw error;
        }
    }
}

// Node.js環境での使用のためのexport（ブラウザでは無視される）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateDiscordWebhookUrl,
        createDiscordEmbed,
        sendDiscordWebhook,
        sendWithRetry
    };
}