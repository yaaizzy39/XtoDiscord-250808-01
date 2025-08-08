// グローバル変数
let webhookUrl = '';
let processedPosts = new Set();

// 初期化
(function() {
    console.log('[XToDiscord] Content script loaded');
    
    // Webhook URLを読み込み
    loadWebhookUrl();
    
    // DOM変更を監視してボタンを追加
    observePostChanges();
    
    // 既存のポストにボタンを追加
    addButtonsToExistingPosts();
    
    // メッセージリスナー（ポップアップからの通知用）
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.type === 'WEBHOOK_URL_UPDATED') {
            webhookUrl = request.url;
            console.log('[XToDiscord] Webhook URL updated');
        }
    });
})();

function loadWebhookUrl() {
    chrome.storage.local.get(['discordWebhookUrl'], function(result) {
        if (result.discordWebhookUrl) {
            webhookUrl = result.discordWebhookUrl;
            console.log('[XToDiscord] Webhook URL loaded');
        }
    });
}

function observePostChanges() {
    const observer = new MutationObserver(function(mutations) {
        let shouldProcess = false;
        
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // 新しいポストが追加された場合
                    if (node.matches && node.matches('article[role="article"]')) {
                        shouldProcess = true;
                    }
                    // 新しいポストを含む要素が追加された場合
                    else if (node.querySelector && node.querySelector('article[role="article"]')) {
                        shouldProcess = true;
                    }
                }
            });
        });
        
        if (shouldProcess) {
            setTimeout(addButtonsToExistingPosts, 500); // DOM更新の完了を待つ
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function addButtonsToExistingPosts() {
    const posts = document.querySelectorAll('article[role="article"]');
    
    posts.forEach(function(post) {
        addButtonToPost(post);
    });
}

function addButtonToPost(post) {
    // 既に処理済みかチェック
    if (post.dataset.xtodiscordProcessed) {
        return;
    }
    
    // アクションバーを探す（いいね、リツイートボタンなどがある場所）
    const actionBar = post.querySelector('[role="group"]');
    if (!actionBar) {
        return;
    }
    
    // ボタンを作成
    const discordButton = createDiscordButton();
    
    // ボタンをアクションバーに追加
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.appendChild(discordButton);
    
    actionBar.appendChild(buttonContainer);
    
    // ボタンのクリックイベント
    discordButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleDiscordButtonClick(post);
    });
    
    // 処理済みマーク
    post.dataset.xtodiscordProcessed = 'true';
}

function createDiscordButton() {
    const button = document.createElement('button');
    button.className = 'xtodiscord-button';
    button.innerHTML = `
        <span>→</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
        </svg>
    `;
    button.title = 'Send to Discord';
    
    return button;
}

function handleDiscordButtonClick(post) {
    if (!webhookUrl) {
        showNotification('Webhook URLが設定されていません。拡張機能のアイコンをクリックして設定してください。', 'error');
        return;
    }
    
    // ボタンをローディング状態に
    const button = post.querySelector('.xtodiscord-button');
    const originalContent = button.innerHTML;
    button.innerHTML = '<span>送信中...</span>';
    button.disabled = true;
    
    // ポスト情報を抽出
    const postData = extractPostData(post);
    
    if (!postData) {
        showNotification('ポスト情報を取得できませんでした', 'error');
        resetButton(button, originalContent);
        return;
    }
    
    // Discordに送信
    sendToDiscord(postData)
        .then(() => {
            showNotification('Discordに送信しました！', 'success');
        })
        .catch((error) => {
            console.error('[XToDiscord] Send failed:', error);
            showNotification('送信に失敗しました', 'error');
        })
        .finally(() => {
            resetButton(button, originalContent);
        });
}

function extractPostData(post) {
    try {
        // ポストのテキスト内容を取得
        const textElements = post.querySelectorAll('[data-testid="tweetText"]');
        let text = '';
        if (textElements.length > 0) {
            text = Array.from(textElements).map(el => el.textContent).join(' ');
        }
        
        // ユーザー名を取得
        const usernameElement = post.querySelector('[data-testid="User-Name"] a');
        let username = '';
        let userHandle = '';
        if (usernameElement) {
            const href = usernameElement.getAttribute('href');
            if (href) {
                userHandle = href.replace('/', '');
            }
            username = usernameElement.textContent || userHandle;
        }
        
        // ポストURLを構築（可能な場合）
        let postUrl = '';
        const timeElement = post.querySelector('time');
        if (timeElement && timeElement.parentElement && timeElement.parentElement.getAttribute('href')) {
            const href = timeElement.parentElement.getAttribute('href');
            postUrl = `https://x.com${href}`;
        }
        
        return {
            text: text || 'テキストなし',
            username: username || 'Unknown User',
            userHandle: userHandle || '',
            postUrl: postUrl || window.location.href
        };
    } catch (error) {
        console.error('[XToDiscord] Error extracting post data:', error);
        return null;
    }
}

function sendToDiscord(postData) {
    // ポストテキストとURLの両方を送信（検索可能 + 画像自動表示）
    let content = '';
    
    // ポストテキストがあれば追加
    if (postData.text && postData.text.trim()) {
        content += `📝 **${postData.username}**: ${postData.text}\n\n`;
    }
    
    // ポストURLを追加（画像自動表示用）
    content += `${postData.postUrl}\n`;
    content += `*Shared via Chrome Extension*`;
    
    const payload = {
        content: content
    };
    
    return fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

function resetButton(button, originalContent) {
    button.innerHTML = originalContent;
    button.disabled = false;
}

function showNotification(message, type) {
    // 既存の通知を削除
    const existingNotification = document.querySelector('.xtodiscord-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 通知要素を作成
    const notification = document.createElement('div');
    notification.className = `xtodiscord-notification ${type}`;
    notification.textContent = message;
    
    // ページに追加
    document.body.appendChild(notification);
    
    // 3秒後に削除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}