let gameStarted = false;
let gameOver = false; // 游戏结束状态
const character = document.querySelector('.character');
const characterSprite = document.getElementById('character-sprite');
const ground = document.querySelector('.ground');
const gameArea = document.querySelector('.game-area'); // 获取 game-area 元素
const startScreen = document.querySelector('.start-screen'); // 获取 start-screen 元素
const markers = document.querySelectorAll('.marker'); // 获取所有标记点
const winMessage = document.querySelector('.win-message'); // 获取胜利信息元素

// Matter.js 相关变量
let engine;
let world;
let rope;
let ropeSegments = [];
let ropeConstraint;
let isSecondGame = false;
let isThirdGame = false;
let characterBody; // 角色的物理碰撞体
let clockBody; // 钟表的物理体
let swordBody; // 剑的物理体
let swordInitialPosition; // 存储宝剑的初始位置
let lastSwordMoveTime = 0; // 记录上次宝剑被移动的时间
let score = 0;
let lastClockVelocity = { x: 0, y: 0 };
let scoreInterval;

// 游戏状态变量
let erasedMarkersCount = 0; // 计数器，记录已擦除的标记数量
let currentSpriteSrc = ''; // 当前角色图片路径
let fireTimer = null; // fire.gif 显示计时器
let isAttracting = false; // 是否正在被吸引
let attractTarget = null; // 吸引目标
let attractStartTime = 0; // 吸引开始时间
const ATTRACT_DURATION = 2000; // 吸引动画持续时间（毫秒）

// 物理参数
const physics = {
    position: { x: window.innerWidth / 2, y: window.innerHeight - 150 }, // 调整初始位置
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    friction: 0.97, // 增加惯性，减小摩擦力
    gravity: 0.1,   // 重力调整
    maxSpeed: 7,    // 最大速度调整
    horizontalAcceleration: 0.5, // 水平加速度
    flightForce: -1.0, // 飞行力调整 (需要克服重力)
    maxFlySpeed: -5, // 最大上升速度 (负数表示向上)
    maxFallSpeed: 6, // 最大下落速度
    isGrounded: false,
    attractionForce: 0.2, // 新增：吸引力大小
    attractedTo: null // 新增：当前被吸引到的腋毛
};

// 控制状态
const controls = {
    left: false,
    right: false,
    up: false,
    down: false
};

// 资源列表和预加载的资源对象
const resources = {
    images: [
        'back_person.png',
        'back.jpeg',
        'stand.gif',
        'run.gif',
        'fire.gif',
        'clock.png',
        'sword.png'  // 添加剑的图片
    ],
    sounds: [
        'background.mp3',
        'fire.mp3',
        'jump.mp3',
        'win.mp3'
    ]
};

// 存储预加载的资源
const loadedResources = {
    images: {},
    sounds: {}
};

// 音频对象（初始化为null，在预加载完成后重新赋值）
let sounds = {
    background: null,
    fire: null,
    jump: null,
    win: null
};

// 添加移动端控制变量
let isMobile = false;
let joystickActive = false;
let joystickPosition = { x: 0, y: 0 };
let joystickStartPosition = { x: 0, y: 0 };
let joystickElement;
let joystickContainer;
let jumpButton;

// 修改设备检测函数 (简化)
function checkMobileDevice() {
    // 主要依赖 CSS 媒体查询来显示/隐藏控件
    // 这里可以保留 isMobile 变量用于 JS 逻辑判断
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent.toLowerCase());
    
    // 强制在iOS设备上设置 isMobile
    if (!isMobile && /iphone|ipad|ipod/i.test(userAgent.toLowerCase())) {
        isMobile = true;
    }

    if (isMobile) {
        console.log("Mobile device detected. Initializing controls...");
        initMobileControls();
        // 阻止默认的触摸滚动和缩放行为
        document.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
        document.body.style.overscrollBehavior = 'none';
    } else {
        console.log("Desktop device detected.");
    }
}

// 修改初始化移动端控制函数
function initMobileControls() {
    joystickElement = document.querySelector('.joystick');
    joystickContainer = document.querySelector('.joystick-container');
    jumpButton = document.querySelector('.jump-button');

    if (!joystickContainer || !jumpButton || !joystickElement) {
        console.error("Failed to find mobile control elements!");
        return;
    }
    console.log("Mobile control elements found:", { joystickContainer, jumpButton });

    // 虚拟摇杆事件处理
    joystickContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
    document.addEventListener('touchmove', handleJoystickMove, { passive: false });
    document.addEventListener('touchend', handleJoystickEnd);
    document.addEventListener('touchcancel', handleJoystickEnd); // 添加 touchcancel 处理

    // 跳跃按钮事件处理
    jumpButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!gameOver && !isAttracting && fireTimer === null) { // 确保不在其他动画状态
            controls.up = true;
            if (physics.isGrounded && sounds.jump) {
                sounds.jump.play().catch(err => console.error("Jump sound error:", err));
            }
        }
    }, { passive: false });

    jumpButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        controls.up = false;
    }, { passive: false });

    console.log("Mobile controls initialized.");
}

// 修改摇杆处理函数
function handleJoystickStart(e) {
    e.preventDefault();
    joystickActive = true;
    const touch = e.touches[0];
    const rect = joystickContainer.getBoundingClientRect();
    joystickStartPosition = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
    updateJoystickPosition(touch.clientX, touch.clientY);
}

function handleJoystickMove(e) {
    if (!joystickActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    updateJoystickPosition(touch.clientX, touch.clientY);
}

// 处理摇杆结束
function handleJoystickEnd() {
    joystickActive = false;
    joystickElement.style.transform = 'translate(-50%, -50%)';
    controls.left = false;
    controls.right = false;
}

// 更新摇杆位置
function updateJoystickPosition(x, y) {
    const dx = x - joystickStartPosition.x;
    const dy = y - joystickStartPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 50;

    if (distance > maxDistance) {
        const angle = Math.atan2(dy, dx);
        joystickPosition = {
            x: Math.cos(angle) * maxDistance,
            y: Math.sin(angle) * maxDistance
        };
    } else {
        joystickPosition = { x: dx, y: dy };
    }

    joystickElement.style.transform = `translate(${joystickPosition.x}px, ${joystickPosition.y}px)`;

    // 更新控制状态
    controls.left = joystickPosition.x < -20;
    controls.right = joystickPosition.x > 20;
}

// 初始化 Matter.js 引擎
function initMatter() {
    // 创建引擎
    engine = Matter.Engine.create();
    world = engine.world;
    
    // 设置重力
    engine.world.gravity.y = 1;

    // 创建渲染器
    const canvas = document.getElementById('physics-canvas');
    const render = Matter.Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: window.innerWidth,
            height: window.innerHeight,
            wireframes: false,
            background: 'transparent'
        }
    });
    
    // 创建绳子
    createRope();
    
    // 创建角色的物理碰撞体
    createCharacterBody();
    
    // 添加碰撞事件监听
    Matter.Events.on(engine, 'collisionStart', handleCollision);
    
    // 运行引擎和渲染器
    Matter.Runner.run(engine);
    Matter.Render.run(render);
}

// 创建绳子
function createRope() {
    const segmentCount = 20; // 绳子段数
    const segmentLength = 20; // 每段长度
    const segmentWidth = 8; // 每段宽度
    const startX = window.innerWidth / 2;
    const startY = 20;
    const clockSize = 40;
    
    // 创建绳子段
    for (let i = 0; i < segmentCount; i++) {
        const segment = Matter.Bodies.rectangle(
            startX,
            startY + i * segmentLength,
            segmentWidth,
            segmentLength,
            {
                collisionFilter: {
                    category: 0x0002,
                    mask: 0x0001 | 0x0004 // 可以与角色(0x0001)和钟表(0x0004)碰撞
                },
                render: {
                    fillStyle: '#FFD700',
                    strokeStyle: '#DAA520',
                    lineWidth: 1
                },
                friction: 0.5,
                restitution: 0,
                density: 0.05
            }
        );
        ropeSegments.push(segment);
        Matter.World.add(world, segment);
    }
    
    // 创建约束
    for (let i = 0; i < segmentCount - 1; i++) {
        const constraint = Matter.Constraint.create({
            bodyA: ropeSegments[i],
            bodyB: ropeSegments[i + 1],
            pointA: { x: 0, y: segmentLength/2 },
            pointB: { x: 0, y: -segmentLength/2 },
            stiffness: 1,
            render: {
                visible: true,
                strokeStyle: '#FFD700',
                lineWidth: 2,
                anchors: false, // 隐藏约束连接点
                type: 'line' // 只渲染线条
            }
        });
        Matter.World.add(world, constraint);
    }
    
    // 固定第一个段
    Matter.Body.setStatic(ropeSegments[0], true);

    // 创建钟表
    clockBody = Matter.Bodies.circle(
        startX,
        startY + segmentCount * segmentLength + clockSize/2,
        clockSize/2,
        {
            render: {
                sprite: {
                    texture: 'clock.png',
                    xScale: clockSize/100,
                    yScale: clockSize/100
                }
            },
            friction: 0.5,
            restitution: 0,
            density: 0.03,
            collisionFilter: {
                category: 0x0004, // 钟表的碰撞类别
                mask: 0x0001 | 0x0002 // 可以与角色(0x0001)和绳子(0x0002)碰撞
            }
        }
    );
    Matter.World.add(world, clockBody);

    // 连接钟表到绳子最后一段
    const clockConstraint = Matter.Constraint.create({
        bodyA: ropeSegments[ropeSegments.length - 1],
        bodyB: clockBody,
        pointA: { x: 0, y: segmentLength/2 },
        pointB: { x: 0, y: -clockSize/2 },
        length: 0,
        stiffness: 1,
        render: {
            visible: true,
            strokeStyle: '#FFD700',
            lineWidth: 2,
            anchors: false, // 隐藏约束连接点
            type: 'line' // 只渲染线条
        }
    });
    Matter.World.add(world, clockConstraint);
}

// 创建角色的物理碰撞体
function createCharacterBody() {
    const characterWidth = 40;
    const characterHeight = 50;
    
    characterBody = Matter.Bodies.rectangle(
        physics.position.x,
        physics.position.y,
        characterWidth,
        characterHeight,
        {
            render: {
                visible: false
            },
            friction: 0.5,
            restitution: 0,
            density: 0.05,
            collisionFilter: {
                category: 0x0001,
                mask: 0x0002 | 0x0004 | 0x0008  // 确保能与剑碰撞
            }
        }
    );
    
    Matter.World.add(world, characterBody);
}

// 处理碰撞事件
function handleCollision(event) {
    event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // 检查是否是角色与宝剑的碰撞
        if ((bodyA === characterBody && bodyB === swordBody) ||
            (bodyB === characterBody && bodyA === swordBody)) {
            
            // 获取角色的速度和位置
            const charBody = bodyA === characterBody ? bodyA : bodyB;
            const charVelocity = charBody.velocity;
            const charPosition = charBody.position;
            const swordPosition = swordBody.position;
            
            // 计算角色相对于宝剑的位置向量
            const relativePos = {
                x: charPosition.x - swordPosition.x,
                y: charPosition.y - swordPosition.y
            };
            
            // 检查角色是否从左下方向碰撞宝剑
            const isPushingFromBottomLeft = true; // 暂时忽略方向检查，测试是否能移动
            
            if (isPushingFromBottomLeft) {
                // 计算碰撞力度 (基于角色速度的绝对值)
                const forceMagnitude = Math.sqrt(
                    charVelocity.x * charVelocity.x + 
                    charVelocity.y * charVelocity.y
                ) * 0.1; // 缩放系数，根据需要调整
                
                // 确保有最小的移动量
                const actualForce = Math.max(forceMagnitude, 0.5);
                
                // 计算宝剑沿右上45度方向的新位置
                const newSwordPosition = {
                    x: swordPosition.x + actualForce * (1/Math.sqrt(2)),
                    y: swordPosition.y - actualForce * (1/Math.sqrt(2))
                };
                
                // 检查新位置是否超过了边界（不能低于初始位置）
                const offsetX = newSwordPosition.x - swordInitialPosition.x;
                const offsetY = newSwordPosition.y - swordInitialPosition.y;
                
                // 计算在左下方向（-1，1）上的投影
                const leftBottomDir = { x: -1, y: 1 };
                const projection = offsetX * leftBottomDir.x + offsetY * leftBottomDir.y;
                
                // 如果投影为负或零，说明宝剑没有超过初始位置的左下方，可以移动
                if (projection <= 0) {
                    Matter.Body.setPosition(swordBody, newSwordPosition);
                    // 更新宝剑最后一次移动的时间
                    lastSwordMoveTime = Date.now();
                }
            }
        }
    });
}

// 预加载资源
function preloadResources() {
    const totalResources = resources.images.length + resources.sounds.length;
    let loadedCount = 0;
    const progressBar = document.querySelector('.loading-progress');
    const percentageText = document.querySelector('.loading-percentage');
    const startText = document.querySelector('.start-text');
    const loadingText = document.querySelector('.loading-text');

    // 添加全局加载超时
    const loadingTimeout = setTimeout(() => {
        loadingText.textContent = '加载时间过长，请点击屏幕继续';
        startText.classList.remove('hidden');
        initializeAudioObjects();
    }, 10000);  // 10秒超时

    // 更新进度
    function updateProgress() {
        loadedCount++;
        const progress = (loadedCount / totalResources) * 100;
        progressBar.style.width = `${progress}%`;
        percentageText.textContent = `${Math.round(progress)}%`;

        if (loadedCount === totalResources) {
            clearTimeout(loadingTimeout);
            loadingText.textContent = '加载完成！';
            startText.classList.remove('hidden');
            initializeAudioObjects();
        }
    }
    
    function initializeAudioObjects() {
        // 预加载完成后初始化音频对象
        sounds = {
            background: loadedResources.sounds['background.mp3'] || new Audio(),
            fire: loadedResources.sounds['fire.mp3'] || new Audio(),
            jump: loadedResources.sounds['jump.mp3'] || new Audio(),
            win: loadedResources.sounds['win.mp3'] || new Audio()
        };
        
        // 设置音频音量
        sounds.background.volume = 0.3;
        sounds.fire.volume = 0.5;
        sounds.jump.volume = 0.5;
        sounds.win.volume = 0.5;
    }

    // 预加载图片
    resources.images.forEach(src => {
        const img = new Image();
        img.onload = () => {
            loadedResources.images[src] = img;
            updateProgress();
        };
        img.onerror = () => {
            // 图片加载错误，但仍然更新进度
            updateProgress();
        };
        img.src = src;
    });

    // 预加载音频 - 针对iOS做特殊处理
    resources.sounds.forEach(src => {
        const audio = new Audio();
        
        // 为每个音频文件设置单独的超时
        const audioTimeout = setTimeout(() => {
            if (!loadedResources.sounds[src]) {
                // 音频加载超时，使用空的Audio对象占位
                loadedResources.sounds[src] = new Audio();
                updateProgress();
            }
        }, 3000); // 3秒超时
        
        audio.oncanplaythrough = () => {
            clearTimeout(audioTimeout);
            loadedResources.sounds[src] = audio;
            updateProgress();
        };
        
        audio.onerror = () => {
            clearTimeout(audioTimeout);
            updateProgress();
        };
        
        audio.src = src;
        
        // 尝试加载，但iOS可能会阻止
        try {
            audio.load();
        } catch (e) {
            // 忽略错误
        }
    });
}

// 修改updateCharacterSprite函数，使用预加载的图片
function updateCharacterSprite() {
    let intendedSrc = '';

    // 如果正在显示 fire.gif，不改变状态
    if (fireTimer !== null) {
        return;
    }

    // 如果正在被吸引，不改变状态
    if (isAttracting) {
        return;
    }

    // 根据状态决定图片
    if (!gameOver) {
        // 游戏进行中
        if (controls.left || controls.right) {
            intendedSrc = 'run.gif';
        } else {
            // 站立或在空中但无水平移动时，显示 stand
            intendedSrc = 'stand.gif';
        }
    } else {
        // 游戏结束后，始终显示 stand
        intendedSrc = 'stand.gif'; 
    }

    // 只有在需要改变图片时才更新 src
    if (intendedSrc !== '' && currentSpriteSrc !== intendedSrc) {
        characterSprite.src = loadedResources.images[intendedSrc].src;
        currentSpriteSrc = intendedSrc;
    }
}

// 新增：计算动画进度
function getAttractProgress() {
    if (!isAttracting) return 0;
    const elapsed = Date.now() - attractStartTime;
    return Math.min(elapsed / ATTRACT_DURATION, 1);
}

// 新增：更新吸引动画
function updateAttractAnimation() {
    if (!isAttracting || !attractTarget) return;

    const progress = getAttractProgress();
    if (progress >= 1) {
        isAttracting = false;
        attractTarget = null;
        return;
    }

    const characterRect = character.getBoundingClientRect();
    const markerRect = attractTarget.getBoundingClientRect();
    
    const startX = characterRect.left;
    const startY = characterRect.top;
    const targetX = markerRect.left + markerRect.width / 2 - characterRect.width / 2;
    const targetY = markerRect.top + markerRect.height / 2 - characterRect.height / 2;

    // 使用缓动函数使动画更平滑
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easedProgress = easeOutCubic(progress);

    const currentX = startX + (targetX - startX) * easedProgress;
    const currentY = startY + (targetY - startY) * easedProgress;

    character.style.left = `${currentX}px`;
    character.style.top = `${currentY}px`;
}

// 修改checkMarkerCollisions函数
function checkMarkerCollisions() {
    if (gameOver || erasedMarkersCount >= markers.length || fireTimer !== null || isAttracting) return;

    const characterRect = character.getBoundingClientRect();

    markers.forEach(marker => {
        if (!marker.hasAttribute('data-erased')) {
            const markerRect = marker.getBoundingClientRect();
            const characterCenter = {
                x: characterRect.left + characterRect.width / 2,
                y: characterRect.top + characterRect.height / 2
            };
            const markerCenter = {
                x: markerRect.left + markerRect.width / 2,
                y: markerRect.top + markerRect.height / 2
            };
            
            const dx = markerCenter.x - characterCenter.x;
            const dy = markerCenter.y - characterCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < characterRect.width) {
                // 播放fire音效
                if (sounds.fire) {
                    sounds.fire.currentTime = 0; // 重置音效播放位置
                    sounds.fire.play().catch(error => {
                        console.error('播放音效失败:', error);
                    });
                }

                // 开始吸引动画
                isAttracting = true;
                attractTarget = marker;
                attractStartTime = Date.now();

                // 显示 fire.gif
                characterSprite.src = loadedResources.images['fire.gif'].src;
                currentSpriteSrc = 'fire.gif';
                
                // 设置1秒后移除腋毛并恢复原来的状态
                if (fireTimer !== null) {
                    clearTimeout(fireTimer);
                }
                fireTimer = setTimeout(() => {
                    // 移除腋毛
                    marker.style.display = 'none'; 
                    marker.setAttribute('data-erased', 'true');
                    erasedMarkersCount++; 

                    // 恢复角色状态
                    fireTimer = null;
                    isAttracting = false;
                    attractTarget = null;

                    // 重置物理状态，从当前位置开始自然下落
                    const characterRect = character.getBoundingClientRect();
                    physics.position.x = characterRect.left;
                    physics.position.y = characterRect.top;
                    physics.velocity.x = 0;
                    physics.velocity.y = 0;
                    physics.acceleration.x = 0;
                    physics.acceleration.y = 0;
                    physics.isGrounded = false;

                    updateCharacterSprite(); // 恢复原来的状态

                    // 检查是否完成所有腋毛
                    if (erasedMarkersCount >= markers.length) {
                        showWinMessage(); 
                    }
                }, 1000);
            }
        }
    });
}

// 修改initCharacter函数，使用预加载的图片
function initCharacter() {
    character.style.left = `${physics.position.x}px`;
    character.style.top = `${physics.position.y}px`;
    currentSpriteSrc = 'stand.gif'; // 初始设置为站立
    characterSprite.src = loadedResources.images['stand.gif'].src;
    characterSprite.style.transform = 'scaleX(1)'; // 初始方向
}

// 更新物理状态
function updatePhysics() {
    // 如果正在显示 fire.gif，不更新物理状态
    if (fireTimer !== null) {
        return;
    }

    if (gameOver && physics.isGrounded) {
        return;
    }

    // --- 垂直加速度 ---
    if (controls.up && !gameOver) {
        physics.acceleration.y = physics.flightForce;
    } else if (!physics.isGrounded) {
        physics.acceleration.y = physics.gravity;
    } else {
        physics.acceleration.y = 0;
        physics.velocity.y = 0;
    }

    // --- 水平加速度 ---
    physics.acceleration.x = 0;
    if (!gameOver) {
        if (controls.left) {
            physics.acceleration.x = -physics.horizontalAcceleration;
        } else if (controls.right) {
            physics.acceleration.x = physics.horizontalAcceleration;
        }
    }

    // --- 吸引力计算 ---
    if (physics.attractedTo && fireTimer !== null) {
        const characterRect = character.getBoundingClientRect();
        const markerRect = physics.attractedTo.getBoundingClientRect();
        
        // 计算中心点
        const characterCenter = {
            x: characterRect.left + characterRect.width / 2,
            y: characterRect.top + characterRect.height / 2
        };
        const markerCenter = {
            x: markerRect.left + markerRect.width / 2,
            y: markerRect.top + markerRect.height / 2
        };

        // 计算方向向量
        const dx = markerCenter.x - characterCenter.x;
        const dy = markerCenter.y - characterCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 计算吸引力
        if (distance > 0) {
            const force = physics.attractionForce;
            physics.acceleration.x += (dx / distance) * force;
            physics.acceleration.y += (dy / distance) * force;
        }
    }

    // --- 更新速度 ---
    physics.velocity.x += physics.acceleration.x;
    physics.velocity.y += physics.acceleration.y;

    // --- 应用水平摩擦力 ---
    if (!gameOver && !controls.left && !controls.right) {
        physics.velocity.x *= physics.friction;
    } else if (gameOver) {
        physics.velocity.x *= physics.friction;
    }

    // --- 限制速度 ---
    let maxSpeed = physics.maxSpeed;
    let maxFlySpeed = physics.maxFlySpeed;
    let maxFallSpeed = physics.maxFallSpeed;

    // 如果正在显示 fire.gif，速度减半
    if (fireTimer !== null) {
        maxSpeed = physics.maxSpeed / 10;
        maxFlySpeed = physics.maxFlySpeed / 10;
        maxFallSpeed = physics.maxFallSpeed / 10;
    }

    physics.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, physics.velocity.x));
    physics.velocity.y = Math.max(maxFlySpeed, Math.min(maxFallSpeed, physics.velocity.y));

    // --- 更新位置 ---
    physics.position.x += physics.velocity.x;
    physics.position.y += physics.velocity.y;

    // --- 边界检测 ---
    if (physics.position.x < 0) {
        physics.position.x = 0;
        physics.velocity.x = 0;
    }
    if (physics.position.x > window.innerWidth - 60) { // Corrected character width
        physics.position.x = window.innerWidth - 60;
        physics.velocity.x = 0;
    }
    if (physics.position.y < 0) {
        physics.position.y = 0;
        physics.velocity.y = Math.max(0, physics.velocity.y);
    }

    // --- 地面碰撞检测 ---
    const groundY = window.innerHeight - 100;
    const characterHeight = 60;
    if (physics.position.y >= groundY - characterHeight) {
        physics.position.y = groundY - characterHeight;
        if (gameOver || !controls.up) {
            physics.velocity.y = 0;
            physics.isGrounded = true;
        } else {
            physics.isGrounded = false;
        }
    } else {
        physics.isGrounded = false;
    }

    // 更新角色位置
    character.style.left = `${physics.position.x}px`;
    character.style.top = `${physics.position.y}px`;

    // 在第二关和第三关中，同步物理碰撞体的位置
    if ((isSecondGame || isThirdGame) && characterBody) {
        Matter.Body.setPosition(characterBody, {
            x: physics.position.x + 60, // 调整偏移量
            y: physics.position.y + 60  // 调整偏移量
        });
        Matter.Body.setVelocity(characterBody, {
            x: physics.velocity.x,
            y: physics.velocity.y
        });
    }

    // 根据移动方向翻转角色
    if (!gameOver && physics.velocity.x > 0.1) {
        characterSprite.style.transform = 'scaleX(1)';
    } else if (!gameOver && physics.velocity.x < -0.1) {
        characterSprite.style.transform = 'scaleX(-1)';
    }

    // 更新角色显示的 GIF
    updateCharacterSprite();

    // 添加移动端控制支持
    if (isMobile && joystickActive) {
        if (controls.left) {
            physics.acceleration.x = -physics.horizontalAcceleration;
        } else if (controls.right) {
            physics.acceleration.x = physics.horizontalAcceleration;
        }
    }
}

// 检查碰撞函数
function checkCollision() {
    const characterRect = character.getBoundingClientRect();
    const markers = document.querySelectorAll('.marker');
    let collisionDetected = false;

    markers.forEach(marker => {
        const markerRect = marker.getBoundingClientRect();
        if (
            characterRect.right > markerRect.left &&
            characterRect.left < markerRect.right &&
            characterRect.bottom > markerRect.top &&
            characterRect.top < markerRect.bottom
        ) {
            collisionDetected = true;
            // 播放fire动画
            characterSprite.src = 'fire.gif';
            
            // 等待fire动画播放完成（假设动画持续1秒）
            setTimeout(() => {
                // 移除腋毛
                marker.remove();
                // 恢复角色动画
                updateCharacterSprite();
            }, 1000);
        }
    });

    return collisionDetected;
}

// 修改showWinMessage函数，使用预加载的音频
function showWinMessage() {
    if (gameOver) return;

    gameOver = true;
    winMessage.classList.remove('hidden');
    sounds.win.play();

    // 停止背景音乐
    if (sounds.background && !sounds.background.paused) {
        sounds.background.pause();
        sounds.background.currentTime = 0;
    }

    // 2秒后进入第二个游戏
    setTimeout(() => {
        startSecondGame();
    }, 2000);
}

// 开始第二个游戏的函数
function startSecondGame() {
    // 隐藏胜利信息
    winMessage.classList.add('hidden');

    // 移除第一个游戏的标记点
    markers.forEach(marker => {
        marker.remove();
    });

    // 移除背景人物图片
    const backgroundPersonContainer = document.querySelector('.background-person-container');
    if (backgroundPersonContainer) {
        backgroundPersonContainer.remove();
    }

    // 重置游戏状态
    gameOver = false;
    erasedMarkersCount = 0;
    isSecondGame = true;
    score = 0;
    
    // 显示分数
    const scoreDisplay = document.querySelector('.score-display');
    scoreDisplay.classList.remove('hidden');
    updateScore(0);
    
    // 初始化物理引擎和绳子
    initMatter();
    
    // 重置角色位置
    physics.position = { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    character.style.left = `${physics.position.x}px`;
    character.style.top = `${physics.position.y}px`;

    // 启动分数计算定时器
    startScoreCalculation();
}

// 更新分数显示
function updateScore(newScore) {
    score = Math.max(0, newScore); // 确保分数不小于0
    document.getElementById('score').textContent = Math.floor(score);
    
    // 检查是否达到过关分数
    if (isSecondGame && score >= 200 && !gameOver) {
        showSecondLevelWin();
    }
    
    // 第三关过关条件 (例如，达到500分)
    if (isThirdGame && score >= 500 && !gameOver) {
        showThirdLevelWin();
    }
}

// 第二关胜利
function showSecondLevelWin() {
    gameOver = true;
    
    // 停止分数计算
    if (scoreInterval) {
        clearInterval(scoreInterval);
    }
    
    // 显示胜利信息
    winMessage.classList.remove('hidden');
    winMessage.querySelector('h2').textContent = '游戏过关！';
    
    // 播放胜利音效
    if (sounds.win) {
        sounds.win.currentTime = 0;
        sounds.win.play();
    }
    
    // 停止背景音乐
    if (sounds.background && !sounds.background.paused) {
        sounds.background.pause();
        sounds.background.currentTime = 0;
    }

    // 2秒后进入第三关
    setTimeout(() => {
        startThirdGame();
    }, 2000);
}

// 开始第三关
function startThirdGame() {
    // 隐藏胜利信息
    winMessage.classList.add('hidden');

    // 清理第二关的物理引擎
    if (engine) {
        Matter.World.clear(world);
        Matter.Engine.clear(engine);
    }

    // 显示分数显示
    const scoreDisplay = document.querySelector('.score-display');
    scoreDisplay.classList.remove('hidden');
    score = 0; // 重置分数
    updateScore(0);

    // 重置游戏状态
    gameOver = false;
    isSecondGame = false;
    isThirdGame = true;

    // 重置角色状态
    physics.velocity.x = 0;
    physics.velocity.y = 0;
    physics.acceleration.x = 0;
    physics.acceleration.y = 0;
    physics.isGrounded = false;

    // 重置按键状态
    controls.left = false;
    controls.right = false;
    controls.up = false;
    controls.down = false;

    // 初始化物理引擎
    initThirdLevelPhysics();

    // 重置角色位置
    physics.position = { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    character.style.left = `${physics.position.x}px`;
    character.style.top = `${physics.position.y}px`;
    
    // 确保物理碰撞体初始位置正确
    Matter.Body.setPosition(characterBody, {
        x: physics.position.x + 60, // 调整偏移量
        y: physics.position.y + 60  // 调整偏移量
    });
}

// 初始化第三关的物理引擎
function initThirdLevelPhysics() {
    // 创建引擎
    engine = Matter.Engine.create();
    world = engine.world;
    
    // 设置重力 (禁用重力)
    engine.world.gravity.y = 0;

    // 创建渲染器
    const canvas = document.getElementById('physics-canvas');
    const render = Matter.Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: window.innerWidth,
            height: window.innerHeight,
            wireframes: false,
            background: 'transparent'
        }
    });

    // 创建剑的物理体
    const swordWidth = 50;  // 剑的宽度
    const swordHeight = 120;  // 剑的高度
    const swordOffsetX = 0;  // 水平偏移
    const swordOffsetY = 0;  // 垂直偏移
    const initialX = window.innerWidth / 2 + swordOffsetX;
    const initialY = window.innerHeight / 2 + swordOffsetY;
    
    swordBody = Matter.Bodies.rectangle(
        initialX,  // x 位置
        initialY, // y 位置
        swordWidth,
        swordHeight,
        {
            isStatic: true,  // 设为静态物体，由我们手动移动
            angle: Math.PI / 4,  // 顺时针旋转45度
            render: {
                sprite: {
                    texture: 'sword.png',
                    xScale: 1,  // 使用原始图片大小
                    yScale: 1
                },
                fillStyle: 'transparent'
            },
            collisionFilter: {
                category: 0x0008,  // 剑的碰撞类别
                mask: 0x0001       // 只与角色碰撞
            }
        }
    );
    Matter.World.add(world, swordBody);
    
    // 保存宝剑的初始位置
    swordInitialPosition = { x: initialX, y: initialY };

    // 创建角色的碰撞体
    createCharacterBody();

    // 添加碰撞事件监听
    Matter.Events.on(engine, 'collisionStart', handleCollision);
    Matter.Events.on(engine, 'collisionActive', handleCollision);

    // 运行引擎和渲染器
    Matter.Runner.run(engine);
    Matter.Render.run(render);
}

// 启动分数计算
function startScoreCalculation() {
    if (scoreInterval) {
        clearInterval(scoreInterval);
    }

    scoreInterval = setInterval(() => {
        if (!isSecondGame || gameOver) {
            clearInterval(scoreInterval);
            return;
        }

        if (clockBody) {
            const velocity = clockBody.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            
            // 计算速度变化
            const lastSpeed = Math.sqrt(
                lastClockVelocity.x * lastClockVelocity.x + 
                lastClockVelocity.y * lastClockVelocity.y
            );
            
            // 如果钟表在移动，增加分数
            if (speed > 0.5) {
                updateScore(score + speed * 0.5); // 根据速度增加分数
            } else {
                // 钟表静止或移动很慢时，缓慢减少分数
                updateScore(score - 0.5);
            }
            
            // 更新上一次的速度
            lastClockVelocity = { x: velocity.x, y: velocity.y };
        }
    }, 100); // 每100毫秒更新一次
}

// 在游戏结束时清理
function cleanupSecondGame() {
    if (scoreInterval) {
        clearInterval(scoreInterval);
    }
}

// 修改handleKeyDown函数，使用预加载的音频
function handleKeyDown(e) {
    if (gameOver) return;
    if (!gameStarted) {
        startGame();
        return;
    }
    const key = e.key.toLowerCase();
    switch(key) {
        case 'w': case 'arrowup': 
            controls.up = true;
            if (physics.isGrounded) {
                sounds.jump.play();
            }
            break;
        case 's': case 'arrowdown': controls.down = true; break;
        case 'a': case 'arrowleft': controls.left = true; break;
        case 'd': case 'arrowright': controls.right = true; break;
    }
}

// 处理键盘松开
function handleKeyUp(e) {
    if (gameOver) return;
    const key = e.key.toLowerCase();
    switch(key) {
        case 'w': case 'arrowup': controls.up = false; break;
        case 's': case 'arrowdown': controls.down = false; break;
        case 'a': case 'arrowleft': controls.left = false; break;
        case 'd': case 'arrowright': controls.right = false; break;
    }
}

// 处理点击开始
function handleClickStart() {
    if (!gameStarted && !gameOver) { // 仅在游戏未开始且未结束时响应
        startGame();
    }
}

// 修改startGame函数，使用预加载的音频
function startGame() {
    if (gameStarted || gameOver) {
        return;
    }

    if (!startScreen || !gameArea) {
        console.error('Start screen or game area element not found!');
        return;
    }

    console.log("Starting game...");

    // 尝试播放背景音乐 (用户交互后才能在iOS上播放)
    if (sounds.background) {
        sounds.background.loop = true;
        sounds.background.play().then(() => {
            console.log("Background music playing.");
        }).catch(error => {
            console.warn("Background music failed to play initially:", error);
            // 可能需要用户再次交互才能播放
        });
    }

    startScreen.classList.add('hidden');
    gameArea.classList.remove('hidden');
    console.log("Game area displayed, start screen hidden.");
    
    // 如果是移动端，确保控制层可见 (虽然CSS应该处理了)
    if (isMobile) {
        const mobileControls = document.querySelector('.mobile-controls');
        if (mobileControls) mobileControls.style.display = 'block';
        console.log("Ensuring mobile controls are displayed via JS.");
    }

    gameStarted = true;
    gameOver = false;
    isSecondGame = false; // 确保从第一关开始
    isThirdGame = false;
    score = 0;
    erasedMarkersCount = 0;

    // 重置第一关的标记点
    markers.forEach(marker => {
        marker.style.display = 'block';
        marker.removeAttribute('data-erased');
    });
    
    // 隐藏可能存在的胜利信息和分数
    if (winMessage) winMessage.classList.add('hidden');
    const scoreDisplay = document.querySelector('.score-display');
    if (scoreDisplay) scoreDisplay.classList.add('hidden');

    // 初始化角色和物理状态
    initCharacter();
    physics.position = { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    physics.velocity = { x: 0, y: 0 };
    physics.acceleration = { x: 0, y: 0 };
    physics.isGrounded = false;
    controls.left = false; controls.right = false; controls.up = false; controls.down = false;

    // 移除启动监听器，添加游戏监听器
    document.removeEventListener('keydown', handleKeyDown); 
    document.removeEventListener('click', handleClickStart);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    console.log("Game started successfully.");
}

// 游戏循环
function gameLoop() {
    if (gameStarted) {
        updatePhysics();
        updateAttractAnimation();
        checkMarkerCollisions();
        
        // 在第二关中更新物理引擎
        if (isSecondGame && engine) {
            Matter.Engine.update(engine);
        }
        
        // 在第三关中更新
        if (isThirdGame && engine) {
            Matter.Engine.update(engine);
            
            // 确保物理碰撞体与角色位置同步 (额外的同步点)
            if (characterBody) {
                Matter.Body.setPosition(characterBody, {
                    x: physics.position.x + 60, // 调整偏移量
                    y: physics.position.y + 60  // 调整偏移量
                });
            }
            
            // 添加宝剑的重力效果
            if (swordBody && swordInitialPosition) {
                // 检查上次移动时间，如果超过500毫秒没有移动，应用重力
                const currentTime = Date.now();
                if (currentTime - lastSwordMoveTime > 500) {
                    const swordPosition = swordBody.position;
                    
                    // 计算重力效果 - 沿左下45度方向缓慢下落
                    const gravityForce = 0.1; // 每帧下落的距离
                    const newSwordPosition = {
                        x: swordPosition.x - gravityForce * (1/Math.sqrt(2)),
                        y: swordPosition.y + gravityForce * (1/Math.sqrt(2))
                    };
                    
                    // 检查新位置是否会低于初始位置
                    // 计算新位置相对于初始位置的偏移
                    const offsetX = newSwordPosition.x - swordInitialPosition.x;
                    const offsetY = newSwordPosition.y - swordInitialPosition.y;
                    
                    // 在左下方向（-1，1）上的投影
                    const leftBottomDir = { x: -1, y: 1 };
                    const projection = offsetX * leftBottomDir.x + offsetY * leftBottomDir.y;
                    
                    // 如果投影为正，说明剑会在左下方向超过初始位置
                    if (projection > 0) {
                        // 将宝剑重置到初始位置或边界上
                        const newPosition = {
                            x: swordInitialPosition.x,
                            y: swordInitialPosition.y
                        };
                        Matter.Body.setPosition(swordBody, newPosition);
                    } else {
                        // 应用重力效果
                        Matter.Body.setPosition(swordBody, newSwordPosition);
                    }
                }
                
                // 根据宝剑位置更新分数
                if (!gameOver && isThirdGame) {
                    const swordPosition = swordBody.position;
                    
                    // 计算宝剑在右上45度方向上的投影距离
                    const offsetX = swordPosition.x - swordInitialPosition.x;
                    const offsetY = swordPosition.y - swordInitialPosition.y;
                    
                    // 在右上方向（1，-1）上的投影
                    const topRightDir = { x: 1, y: -1 };
                    const projection = offsetX * topRightDir.x + offsetY * topRightDir.y;
                    
                    // 计算分数 - 投影距离乘以系数
                    const distanceScore = Math.max(0, projection) * 2; // 可以调整系数以改变分数增长速度
                    
                    // 更新分数显示
                    updateScore(distanceScore);
                }
            }
        }
    }
    requestAnimationFrame(gameLoop);
}

// 初始化事件监听 (用于启动游戏)
document.addEventListener('keydown', handleKeyDown); 
document.addEventListener('click', handleClickStart); 

// 启动游戏循环
gameLoop(); 

// 在页面加载完成后开始预加载
window.addEventListener('load', () => {
    console.log("Window loaded.");
    checkMobileDevice(); // 检测设备并初始化移动控件（如果需要）
    preloadResources(); // 开始预加载
}); 

// 第三关胜利
function showThirdLevelWin() {
    gameOver = true;
    
    // 显示胜利信息
    winMessage.classList.remove('hidden');
    winMessage.querySelector('h2').textContent = '恭喜！你成功完成了所有关卡！';
    
    // 播放胜利音效
    if (sounds.win) {
        sounds.win.currentTime = 0;
        sounds.win.play();
    }
    
    // 停止背景音乐
    if (sounds.background && !sounds.background.paused) {
        sounds.background.pause();
        sounds.background.currentTime = 0;
    }
} 