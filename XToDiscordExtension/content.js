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
    
    // ブックマークを確認・追加してからDiscordに送信
    addToBookmarkIfNeeded(post)
        .then(() => {
            // Discordに送信
            return sendToDiscord(postData);
        })
        .then(() => {
            showNotification('ブックマーク追加 & Discordに送信しました！', 'success');
        })
        .catch((error) => {
            console.error('[XToDiscord] Send failed:', error);
            showNotification('送信に失敗しました', 'error');
        })
        .finally(() => {
            resetButton(button, originalContent);
        });
}

function addToBookmarkIfNeeded(post) {
    return new Promise((resolve, reject) => {
        try {
            // ブックマークボタンを探す（複数のセレクターで試行）
            let bookmarkButton = null;
            
            // 試行1: data-testid="bookmark"
            bookmarkButton = post.querySelector('[data-testid="bookmark"]');
            
            // 試行2: aria-labelでブックマーク関連を探す
            if (!bookmarkButton) {
                const buttons = post.querySelectorAll('button, div[role="button"]');
                for (const button of buttons) {
                    const ariaLabel = button.getAttribute('aria-label');
                    if (ariaLabel && (
                        ariaLabel.includes('ブックマーク') ||
                        ariaLabel.includes('Bookmark') ||
                        ariaLabel.includes('bookmark')
                    )) {
                        bookmarkButton = button;
                        break;
                    }
                }
            }
            
            // 試行3: SVGの形状でブックマークボタンを判定
            if (!bookmarkButton) {
                const svgElements = post.querySelectorAll('svg');
                for (const svg of svgElements) {
                    const path = svg.querySelector('path');
                    if (path) {
                        const d = path.getAttribute('d');
                        // ブックマークアイコンのpath（空のブックマーク）
                        if (d && (d.includes('M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z') ||
                                 d.includes('M3 4.5C3 3.12 4.12 2 5.5 2h13C19.88 2 21 3.12 21 4.5v18.44L12 16.5l-9 6.44V4.5z'))) {
                            bookmarkButton = svg.closest('button, div[role="button"]');
                            break;
                        }
                    }
                }
            }
            
            if (!bookmarkButton) {
                console.log('[XToDiscord] Bookmark button not found');
                resolve(); // ボタンが見つからなくても続行
                return;
            }
            
            console.log('[XToDiscord] Found bookmark button:', bookmarkButton);
            
            // ブックマーク状態を確認
            console.log('[XToDiscord] === BEFORE CLICK ===');
            const isBookmarked = checkIfBookmarked(bookmarkButton);
            
            if (isBookmarked) {
                console.log('[XToDiscord] ✅ Already bookmarked - keeping bookmark ON');
                resolve();
                return;
            }
            
            // ブックマークがOFFの場合のみONにする
            console.log('[XToDiscord] ❌ Bookmark is OFF - turning ON...');
            console.log('[XToDiscord] Clicking bookmark button...');
            bookmarkButton.click();
            
            // 少し待ってからブックマーク追加を確認
            setTimeout(() => {
                console.log('[XToDiscord] === AFTER CLICK ===');
                const nowBookmarked = checkIfBookmarked(bookmarkButton);
                if (nowBookmarked) {
                    console.log('[XToDiscord] ✅ Bookmark successfully turned ON');
                } else {
                    console.log('[XToDiscord] ⚠️ Bookmark add may have failed, but continuing...');
                }
                resolve();
            }, 500);
            
        } catch (error) {
            console.error('[XToDiscord] Bookmark error:', error);
            resolve(); // エラーが発生してもDiscord送信は続行
        }
    });
}

function checkIfBookmarked(bookmarkButton) {
    console.log('[XToDiscord] Checking bookmark status...');
    
    // 方法1: aria-labelをチェック
    const ariaLabel = bookmarkButton.getAttribute('aria-label');
    console.log('[XToDiscord] Aria-label:', ariaLabel);
    
    if (ariaLabel) {
        // 既にブックマーク済みの場合のラベル
        const bookmarkedLabels = [
            'ブックマークを削除',
            'ブックマークから削除',
            'ブックマークに追加済み',  // ← これが重要！
            'ブックマーク済み',
            'Remove from Bookmarks',
            'Remove Bookmark',
            'Bookmarked',
            'Remove from bookmarks',
            'Unbookmark',
            'Added to Bookmarks'
        ];
        
        for (const label of bookmarkedLabels) {
            if (ariaLabel.includes(label)) {
                console.log('[XToDiscord] Found bookmarked aria-label:', label);
                return true;
            }
        }
        
        // 明確にブックマークを追加する（未ブックマーク）場合のラベル
        const unbookmarkedLabels = [
            'ブックマークに追加',
            'ブックマーク',
            'Add to Bookmarks',
            'Bookmark'
        ];
        
        for (const label of unbookmarkedLabels) {
            // 「追加済み」が含まれていない場合のみ未ブックマーク判定
            if (ariaLabel === label || 
                (ariaLabel.includes(label) && 
                 !ariaLabel.includes('済み') && 
                 !ariaLabel.includes('削除') && 
                 !ariaLabel.includes('Remove'))) {
                console.log('[XToDiscord] Found unbookmarked aria-label:', label);
                return false;
            }
        }
    }
    
    // 方法2: SVGアイコンの詳細チェック
    const svg = bookmarkButton.querySelector('svg');
    if (svg) {
        console.log('[XToDiscord] Checking SVG paths...');
        const paths = svg.querySelectorAll('path');
        
        for (const path of paths) {
            const d = path.getAttribute('d');
            const fill = path.getAttribute('fill');
            const style = path.getAttribute('style');
            
            console.log('[XToDiscord] Path d:', d);
            console.log('[XToDiscord] Path fill:', fill);
            console.log('[XToDiscord] Path style:', style);
            
            if (d) {
                // 塗りつぶされたブックマークアイコンのパターン
                const filledBookmarkPatterns = [
                    'M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5Z',
                    'M3 4.5C3 3.12 4.12 2 5.5 2h13C19.88 2 21 3.12 21 4.5v18.44L12 16.5l-9 6.44V4.5Z'
                ];
                
                // exactな一致をチェック
                for (const pattern of filledBookmarkPatterns) {
                    if (d === pattern) {
                        console.log('[XToDiscord] Found filled bookmark pattern');
                        return true;
                    }
                }
                
                // fillが設定されているかチェック
                if (fill && fill !== 'none' && fill !== 'transparent' && fill !== 'currentColor') {
                    console.log('[XToDiscord] Found filled path with fill:', fill);
                    return true;
                }
                
                // styleでfillが設定されているかチェック
                if (style && style.includes('fill:') && !style.includes('fill:none')) {
                    console.log('[XToDiscord] Found filled path with style:', style);
                    return true;
                }
            }
        }
    }
    
    // 方法3: data属性やクラス名をチェック
    const classes = Array.from(bookmarkButton.classList);
    console.log('[XToDiscord] Button classes:', classes);
    
    // よくあるブックマーク済みを示すクラス名
    const bookmarkedClasses = ['bookmarked', 'active', 'selected', 'on', 'filled'];
    for (const cls of bookmarkedClasses) {
        if (bookmarkButton.classList.contains(cls)) {
            console.log('[XToDiscord] Found bookmarked class:', cls);
            return true;
        }
    }
    
    console.log('[XToDiscord] No bookmark indicators found - assuming unbookmarked');
    return false;
}

function extractPostData(post) {
    try {
        // ポストのテキスト内容を取得（複数のセレクターで試行）
        let text = '';
        
        // 試行1: data-testid="tweetText"
        let textElements = post.querySelectorAll('[data-testid="tweetText"]');
        if (textElements.length > 0) {
            text = Array.from(textElements).map(el => el.textContent).join(' ');
        }
        
        // 試行2: lang属性を持つdiv（ツイートテキストによくある）
        if (!text) {
            textElements = post.querySelectorAll('div[lang]');
            if (textElements.length > 0) {
                // 最も長いテキストを選択（通常はメインのツイートテキスト）
                const longestElement = Array.from(textElements).reduce((prev, current) => {
                    return (current.textContent.length > prev.textContent.length) ? current : prev;
                });
                text = longestElement.textContent;
            }
        }
        
        // 試行3: span要素内のテキストを収集
        if (!text) {
            textElements = post.querySelectorAll('div[dir] span');
            if (textElements.length > 0) {
                text = Array.from(textElements)
                    .map(el => el.textContent)
                    .filter(t => t.length > 10) // 短すぎるテキストを除外
                    .join(' ');
            }
        }
        
        console.log('[XToDiscord] Extracted text:', text);
        
        // ユーザー名を取得（複数の方法で試行）
        let username = '';
        let userHandle = '';
        
        // 試行1: data-testid="User-Name"
        let usernameElement = post.querySelector('[data-testid="User-Name"] a, [data-testid="User-Name"] span');
        if (!usernameElement) {
            // 試行2: href属性に/で始まるリンクを探す
            const links = post.querySelectorAll('a[href^="/"]');
            for (const link of links) {
                const href = link.getAttribute('href');
                if (href && href.match(/^\/[a-zA-Z0-9_]+$/)) {
                    usernameElement = link;
                    break;
                }
            }
        }
        
        if (usernameElement) {
            const href = usernameElement.getAttribute('href');
            if (href) {
                userHandle = href.replace('/', '');
            }
            username = usernameElement.textContent || userHandle;
        }
        
        console.log('[XToDiscord] Extracted username:', username);
        
        // ポストURLを構築（可能な場合）
        let postUrl = '';
        const timeElement = post.querySelector('time');
        if (timeElement && timeElement.parentElement && timeElement.parentElement.getAttribute('href')) {
            const href = timeElement.parentElement.getAttribute('href');
            postUrl = `https://x.com${href}`;
        }
        
        // timeElementが見つからない場合の代替方法
        if (!postUrl) {
            const statusLinks = post.querySelectorAll('a[href*="/status/"]');
            if (statusLinks.length > 0) {
                const href = statusLinks[0].getAttribute('href');
                postUrl = `https://x.com${href}`;
            }
        }
        
        console.log('[XToDiscord] Extracted postUrl:', postUrl);
        
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