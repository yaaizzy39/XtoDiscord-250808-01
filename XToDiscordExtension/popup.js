document.addEventListener('DOMContentLoaded', function() {
    const webhookUrlInput = document.getElementById('webhookUrl');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    
    // 保存されたWebhook URLを読み込み
    loadWebhookUrl();
    
    // 保存ボタンのイベントリスナー
    saveButton.addEventListener('click', saveWebhookUrl);
    
    // EnterキーでもWebhook URLを保存
    webhookUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveWebhookUrl();
        }
    });
    
    function loadWebhookUrl() {
        chrome.storage.local.get(['discordWebhookUrl'], function(result) {
            if (result.discordWebhookUrl) {
                webhookUrlInput.value = result.discordWebhookUrl;
            }
        });
    }
    
    function saveWebhookUrl() {
        const webhookUrl = webhookUrlInput.value.trim();
        
        if (!webhookUrl) {
            showStatus('Webhook URLを入力してください', 'error');
            return;
        }
        
        // Discord Webhook URLの形式をチェック
        if (!isValidDiscordWebhookUrl(webhookUrl)) {
            showStatus('有効なDiscord Webhook URLを入力してください', 'error');
            return;
        }
        
        // ストレージに保存
        chrome.storage.local.set({
            discordWebhookUrl: webhookUrl
        }, function() {
            if (chrome.runtime.lastError) {
                showStatus('保存に失敗しました', 'error');
            } else {
                showStatus('Webhook URLが保存されました！', 'success');
                
                // コンテンツスクリプトに通知
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            type: 'WEBHOOK_URL_UPDATED',
                            url: webhookUrl
                        }).catch(() => {
                            // メッセージ送信に失敗した場合は無視（ページがリロードされていない可能性）
                        });
                    }
                });
            }
        });
    }
    
    function isValidDiscordWebhookUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === 'discord.com' || urlObj.hostname === 'discordapp.com';
        } catch {
            return false;
        }
    }
    
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        // 3秒後にメッセージを非表示
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});