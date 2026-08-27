import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { SessionManager } from '../session/index.js';
import { handleInbound, createOutboundHandler } from '../transport/index.js';
import { buildUserAgent } from '../shared/index.js';
import { setupMiddlewares } from './middleware-setup.js';
export async function bootstrapGateway(ctx, agents, config, logger) {
    const manager = new SessionManager(ctx, agents, config, logger);
    // ── 初始化 QQ Bot SDK ──
    const userAgent = buildUserAgent();
    const bot = new QQBot({
        appId: config.appId,
        appSecret: config.appSecret,
        transport: 'websocket',
        baseUrl: process.env.QQBOT_BASE_URL?.replace(/\/+$/, '') || 'https://api.bot.qq.com',
        tokenBaseUrl: process.env.QQBOT_TOKEN_BASE_URL?.replace(/\/+$/, '') || 'https://api.bot.qq.com',
        userAgent,
        logger,
    });
    ctx.provide('qqbot.bot', bot);
    ctx.provide('qqbot.sessionManager', manager);
    logger.info(`QQBot SDK initialized (UA: ${userAgent})`);
    // ── 中间件链 ──
    setupMiddlewares(bot, config, manager, logger);
    // ── 入站：经过中间件链后的消息交给 dsh agent ──
    bot.on('message', async (mCtx) => {
        const msg = mCtx.message;
        if (config.debug) {
            logger.debug(`← message (post-middleware): ${JSON.stringify(msg, null, 2).slice(0, 500)}`);
        }
        await handleInbound(msg, manager, config, logger, mCtx.state);
    });
    // ── 出站：dsh session/event → QQ 消息 ──
    // 获取 tools 服务（工具结果结构化展示，参考 dsh-TUI presentResult），可选
    let toolsRegistry;
    try {
        toolsRegistry = ctx.get('tools');
    }
    catch {
        toolsRegistry = undefined;
    }
    // 发送适配器：将 QQBot 实例适配为 QQBotSender（openStream 参数形态不同）
    const sender = {
        sendMarkdown: (target, content) => bot.sendMarkdown(target, content),
        openStream: (target) => bot.openStream({
            target: {
                scope: target.scope,
                targetId: target.targetId,
                msgId: target.msgId,
            },
        }),
    };
    const outboundHandler = createOutboundHandler(manager, sender, config, logger, toolsRegistry);
    ctx
        .on('session/event', outboundHandler);
    bot.on('error', (err) => {
        logger.error(`bot error: ${err instanceof Error ? err.message : String(err)}`);
    });
    bot.on('ready', () => {
        console.log(`[im-qqbot] Bot ready! appId=${config.appId}`);
    });
    // ── 生命周期 ──
    ctx
        .effect(() => {
        logger.info(`Starting bot (appId=${config.appId})`);
        bot.start().catch((err) => {
            logger.error(`Bot start failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        return async () => {
            logger.info('Shutting down');
            await manager.disposeAll();
            bot.stop();
        };
    }, 'im-qqbot.lifecycle');
}
//# sourceMappingURL=bootstrap.js.map