// =================== 处理按钮点击 ===================
bot.on("callback_query", async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const userId = query.from.id;

    // 提取消息内容
    const text = query.message.text;
    const coin = (text.match(/Coin:\s\*?(.*?)\*/)||["","Unknown"])[1];
    const amount = (text.match(/Amount:\s\*?(.*?)\*/)||["","Unknown"])[1];

    const operator = query.from.username
        ? `@${query.from.username}`
        : query.from.first_name;

    // 防重复操作
    const prev = actionMap.get(msgId);
    if (prev && prev !== userId) {
        return bot.answerCallbackQuery(query.id, {
            text: "此订单已经被其他管理员操作！",
            show_alert: true
        });
    }
    actionMap.set(msgId, userId);

    let result = "";

    // =================== 按钮对应功能 ===================
    switch (data) {
        case "success":
            result =
                `✔️ *交易已成功*\n\n` +
                `币种：*${coin}*\n` +
                `金额：*${amount}*\n` +
                `操作人：${operator}\n` +
                `时间：${new Date().toLocaleString()}`;
            break;

        case "cancel":
            result =
                `❌ *交易已取消*\n\n` +
                `币种：*${coin}*\n` +
                `金额：*${amount}*\n` +
                `操作人：${operator}\n` +
                `时间：${new Date().toLocaleString()}`;
            break;

        case "lock":
            result =
                `🔒 *订单已锁定（Stop Processing）*\n` +
                `管理员：${operator}`;
            break;

        case "unlock":
            result =
                `🔓 *订单已解锁（Resume Processing）*\n` +
                `管理员：${operator}`;
            break;

        case "approve":
            result =
                `🟢 *订单审核通过*\n` +
                `管理员：${operator}`;
            break;

        default:
            return;
    }

    // 修改当前消息
    bot.editMessageText(result, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: "Markdown"
    });

    bot.answerCallbackQuery(query.id);

    // 同步给其他管理员
    for (const adminID of ADMINS) {
        if (adminID !== chatId)
            bot.sendMessage(adminID, result, { parse_mode: "Markdown" });
    }

    // 同步到群
    if (chatId !== GROUP_ID)
        bot.sendMessage(GROUP_ID, result, { parse_mode: "Markdown" });
});


// =========== 前端 /trade 调用接口 ===========
app.post("/trade", async (req, res) => {
    try {
        await sendTradeMessage(req.body);
        res.send("Trade sent.");
    } catch (err) {
        console.error(err);
        res.status(500).send("error");
    }
});


// =========== 首页 ===========
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});


// =========== 启动服务器 ===========
app.listen(PORT, () => {
    console.log(`🚀 Bot server running on port ${PORT}`);
});
