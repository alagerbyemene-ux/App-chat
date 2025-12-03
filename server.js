const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' }
});

// التأكد من وجود مجلد Uploads
if (!fs.existsSync('Uploads')) {
    fs.mkdirSync('Uploads');
}

let users = [];
let rooms = [
    { id: 1, name: 'الغرفة الرئيسية', description: 'غرفة عامة للجميع', background: null, ownerId: null, ownerName: 'النظام' }
];
let friendRequests = {}; 
let friendsList = {};
let messages = [];
let privateMessages = [];
let news = [];
let stories = [];
let bans = [];
let permanentBans = [];
let mutes = [];
let floodProtection = new Map();
let competitions = [];
let comments = [];
let xoGames = {};
let advertisements = [];
let onlineUsers = new Map();
let roomKicks = [];

app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('Uploads'));
app.use('/Uploads', express.static('Uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'Uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webm|webp|mp3|wav|ogg/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/');
        if (extname || mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('الملف يجب أن يكون صورة أو صوت'));
        }
    }
});

const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    console.error('خطأ: يجب تعيين OWNER_EMAIL و OWNER_PASSWORD في متغيرات البيئة');
    console.error('مثال: OWNER_EMAIL=email@example.com OWNER_PASSWORD=password node server.js');
    process.exit(1);
}

function isOwner(user) {
    return user?.email === OWNER_EMAIL;
}

function canCreateAds(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'owner' || user.rank === 'vip' || user.rank === 'gold' || isOwner(user);
}

function isPermanentlyBanned(email) {
    return permanentBans.some(ban => ban.email === email);
}

function getBanInfo(email) {
    return permanentBans.find(ban => ban.email === email);
}

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (isPermanentlyBanned(email)) {
        const banInfo = getBanInfo(email);
        return res.status(403).json({ 
            error: 'تم حظرك نهائياً من هذا الشات',
            reason: banInfo?.reason || 'مخالفة القوانين',
            bannedAt: banInfo?.timestamp
        });
    }
    
    let user = users.find(u => u.email === email && u.password === password);
    
    if (!user && email === OWNER_EMAIL && password === OWNER_PASSWORD) {
        user = {
            id: users.length + 1,
            email: OWNER_EMAIL,
            password: OWNER_PASSWORD,
            display_name: 'مالك الموقع',
            rank: 'chat_star',
            role: 'admin',
            profile_image1: null,
            profile_image2: null,
            message_background: null,
            age: null,
            gender: null,
            marital_status: null,
            about_me: 'مالك ومؤسس شات رعود الظلام'
        };
        users.push(user);
    }
    
    if (user) {
        if (email === OWNER_EMAIL) {
            user.role = 'admin';
            user.rank = 'chat_star';
        }
        const token = 'fake-token-' + user.id;
        res.json({ token, user });
    } else {
        res.status(401).json({ error: 'بيانات تسجيل الدخول غير صحيحة' });
    }
});

app.post('/api/register', (req, res) => {
    const { email, password, display_name } = req.body;
    
    if (isPermanentlyBanned(email)) {
        return res.status(403).json({ 
            error: 'تم حظر هذا البريد الإلكتروني نهائياً'
        });
    }
    
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'البريد الإلكتروني موجود مسبقًا' });
    }
    
    const newUser = {
        id: users.length + 1,
        email,
        password,
        display_name,
        rank: 'visitor',
        role: 'user',
        profile_image1: null,
        profile_image2: null,
        message_background: null,
        age: null,
        gender: null,
        marital_status: null,
        about_me: null
    };
    users.push(newUser);
    const token = 'fake-token-' + newUser.id;
    res.json({ token, user: newUser });
});

app.get('/api/user/profile', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (user) res.json(user);
    else res.status(401).json({ error: 'غير مصرح له' });
});

app.put('/api/user/profile', upload.fields([
    { name: 'profileImage1', maxCount: 1 },
    { name: 'profileImage2', maxCount: 1 },
    { name: 'messageBackground', maxCount: 1 }
]), (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user) return res.status(401).json({ error: 'غير مصرح له' });

    const { display_name, age, gender, marital_status, about_me } = req.body;
    if (display_name) user.display_name = display_name;
    if (age) user.age = parseInt(age);
    if (gender) user.gender = gender;
    if (marital_status) user.marital_status = marital_status;
    if (about_me) user.about_me = about_me;

    if (req.files && req.files['profileImage1']) user.profile_image1 = `/Uploads/${req.files['profileImage1'][0].filename}`;
    if (req.files && req.files['profileImage2']) user.profile_image2 = `/Uploads/${req.files['profileImage2'][0].filename}`;
    if (req.files && req.files['messageBackground']) user.message_background = `/Uploads/${req.files['messageBackground'][0].filename}`;

    res.json(user);
    io.emit('userUpdated', user);
});

app.get('/api/rooms', (req, res) => res.json(rooms));

app.post('/api/rooms', upload.single('roomBackground'), (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user || (!isOwner(user) && user.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح - للمالك والإداريين فقط' });
    }

    const { name, description, ownerId } = req.body;
    const background = req.file ? `/Uploads/${req.file.filename}` : null;
    
    let roomOwner = null;
    let roomOwnerName = 'النظام';
    
    if (ownerId) {
        roomOwner = users.find(u => u.id === parseInt(ownerId));
        if (roomOwner) {
            roomOwnerName = roomOwner.display_name;
        }
    }
    
    const newRoom = { 
        id: rooms.length + 1, 
        name, 
        description: description || '', 
        background,
        ownerId: roomOwner ? roomOwner.id : null,
        ownerName: roomOwnerName
    };
    rooms.push(newRoom);
    io.emit('roomCreated', newRoom);
    io.emit('roomsUpdated', rooms);
    res.json(newRoom);
});

app.put('/api/rooms/:id', upload.single('roomBackground'), (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user || (!isOwner(user) && user.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const roomId = parseInt(req.params.id);
    const room = rooms.find(r => r.id === roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });

    const { name, description, ownerId } = req.body;
    if (name) room.name = name;
    if (description !== undefined) room.description = description;
    if (req.file) room.background = `/Uploads/${req.file.filename}`;
    
    if (ownerId) {
        const roomOwner = users.find(u => u.id === parseInt(ownerId));
        if (roomOwner) {
            room.ownerId = roomOwner.id;
            room.ownerName = roomOwner.display_name;
        }
    }

    io.emit('roomUpdated', room);
    io.emit('roomsUpdated', rooms);
    res.json(room);
});

app.delete('/api/rooms/:id', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user || (!isOwner(user) && user.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const roomId = parseInt(req.params.id);
    if (roomId === 1) {
        return res.status(400).json({ error: 'لا يمكن حذف الغرفة الرئيسية' });
    }
    
    rooms = rooms.filter(r => r.id !== roomId);
    io.emit('roomDeleted', roomId);
    io.emit('roomsUpdated', rooms);
    res.json({ message: 'تم حذف الغرفة' });
});

app.get('/api/messages/:roomId', (req, res) => {
    res.json(messages.filter(m => m.roomId === parseInt(req.params.roomId)));
});

app.get('/api/private-messages/:userId', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const current = users.find(u => 'fake-token-' + u.id === token);
    if (!current) return res.status(401).json({ error: 'غير مصرح له' });

    const otherUserId = parseInt(req.params.userId);
    const relevantMessages = privateMessages.filter(pm => 
        (pm.senderId === current.id && pm.receiverId === otherUserId) || 
        (pm.senderId === otherUserId && pm.receiverId === current.id)
    );
    res.json(relevantMessages);
});

app.get('/api/private-conversations', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const current = users.find(u => 'fake-token-' + u.id === token);
    if (!current) return res.status(401).json({ error: 'غير مصرح له' });

    const conversations = new Map();
    
    privateMessages.forEach(pm => {
        let otherUserId;
        if (pm.senderId === current.id) {
            otherUserId = pm.receiverId;
        } else if (pm.receiverId === current.id) {
            otherUserId = pm.senderId;
        } else {
            return;
        }
        
        if (!conversations.has(otherUserId) || new Date(pm.timestamp) > new Date(conversations.get(otherUserId).lastMessage.timestamp)) {
            const otherUser = users.find(u => u.id === otherUserId);
            conversations.set(otherUserId, {
                userId: otherUserId,
                display_name: otherUser?.display_name || 'مستخدم محذوف',
                profile_image1: otherUser?.profile_image1,
                rank: otherUser?.rank,
                lastMessage: pm,
                unreadCount: privateMessages.filter(m => m.senderId === otherUserId && m.receiverId === current.id && !m.read).length
            });
        }
    });
    
    res.json(Array.from(conversations.values()));
});

app.get('/api/online-users', (req, res) => {
    const onlineUsersList = Array.from(onlineUsers.values()).map(u => ({
        id: u.userId,
        display_name: u.display_name,
        rank: u.rank,
        profile_image1: u.profile_image1,
        currentRoom: u.currentRoom
    }));
    res.json(onlineUsersList);
});

app.post('/api/permanent-ban', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    
    if (!isOwner(admin)) {
        return res.status(403).json({ error: 'فقط مالك الموقع يمكنه الحظر النهائي' });
    }

    const { userId, reason } = req.body;
    const targetUser = users.find(u => u.id === parseInt(userId));
    
    if (!targetUser) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (targetUser.email === OWNER_EMAIL) {
        return res.status(400).json({ error: 'لا يمكن حظر مالك الموقع' });
    }

    permanentBans.push({
        id: permanentBans.length + 1,
        email: targetUser.email,
        userId: targetUser.id,
        display_name: targetUser.display_name,
        reason: reason || 'مخالفة قوانين الشات',
        timestamp: new Date(),
        bannedBy: admin.display_name
    });

    const targetSocket = findSocketByUserId(targetUser.id);
    if (targetSocket) {
        targetSocket.emit('permanentlyBanned', { reason: reason || 'مخالفة قوانين الشات' });
        targetSocket.disconnect();
    }

    io.emit('userPermanentlyBanned', { 
        userId: targetUser.id, 
        display_name: targetUser.display_name,
        reason 
    });
    
    res.json({ message: `تم حظر ${targetUser.display_name} نهائياً` });
});

app.delete('/api/permanent-ban/:id', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    
    if (!isOwner(admin)) {
        return res.status(403).json({ error: 'فقط مالك الموقع يمكنه إلغاء الحظر' });
    }

    const banId = parseInt(req.params.id);
    permanentBans = permanentBans.filter(b => b.id !== banId);
    
    res.json({ message: 'تم إلغاء الحظر' });
});

app.get('/api/permanent-bans', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    
    if (!isOwner(admin)) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    res.json(permanentBans);
});

app.post('/api/kick-from-room', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    
    if (!admin || (!isOwner(admin) && admin.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const { userId, roomId, reason } = req.body;
    const targetUser = users.find(u => u.id === parseInt(userId));
    const room = rooms.find(r => r.id === parseInt(roomId));
    
    if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });

    roomKicks.push({
        id: roomKicks.length + 1,
        userId: targetUser.id,
        roomId: room.id,
        reason: reason || 'طرد من الغرفة',
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    const targetSocket = findSocketByUserId(targetUser.id);
    if (targetSocket && targetSocket.currentRoom === roomId) {
        targetSocket.leave(roomId);
        targetSocket.currentRoom = 1;
        targetSocket.join(1);
        targetSocket.emit('kickedFromRoom', { 
            roomId, 
            roomName: room.name,
            reason: reason || 'تم طردك من هذه الغرفة' 
        });
    }

    io.to(roomId).emit('userKicked', { 
        userId: targetUser.id, 
        display_name: targetUser.display_name 
    });
    
    res.json({ message: `تم طرد ${targetUser.display_name} من ${room.name}` });
});

app.get('/api/news', (req, res) => {
    res.json(news);
});

app.post('/api/news', upload.single('newsFile'), (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user) return res.status(401).json({ error: 'غير مصرح له' });

    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'يجب إدخال محتوى أو ملف' });

    const media = req.file ? `/Uploads/${req.file.filename}` : null;
    const newNews = {
        id: news.length + 1,
        content,
        media,
        user_id: user.id,
        display_name: user.display_name,
        timestamp: new Date(),
        likes: []
    };
    news.push(newNews);
    io.emit('newNews', newNews);
    res.json(newNews);
});

app.get('/api/stories', (req, res) => {
    res.json(stories.filter(s => new Date() - new Date(s.timestamp) < 24 * 60 * 60 * 1000));
});

app.post('/api/stories', upload.single('storyImage'), (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user) return res.status(401).json({ error: 'غير مصرح له' });

    const image = req.file ? `/Uploads/${req.file.filename}` : null;
    if (!image) return res.status(400).json({ error: 'يجب رفع صورة' });

    const newStory = {
        id: stories.length + 1,
        image,
        user_id: user.id,
        display_name: user.display_name,
        timestamp: new Date()
    };
    stories.push(newStory);
    io.emit('newStory', newStory);
    res.json(newStory);
});

app.post('/api/comments', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user) return res.status(401).json({ error: 'غير مصرح له' });

    const { postId, content, targetUserId } = req.body;
    const newComment = {
        id: comments.length + 1,
        postId: parseInt(postId),
        content,
        user_id: user.id,
        display_name: user.display_name,
        targetUserId: targetUserId ? parseInt(targetUserId) : null,
        timestamp: new Date()
    };
    comments.push(newComment);

    if (targetUserId) {
        io.emit('newComment', { ...newComment, targetUserId });
    }

    res.json(newComment);
});

app.get('/api/comments/:postId', (req, res) => {
    const postComments = comments.filter(c => c.postId === parseInt(req.params.postId));
    res.json(postComments);
});

app.post('/api/competitions', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);
    if (!user || (!isOwner(user) && user.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const { title, duration } = req.body;
    const newCompetition = {
        id: competitions.length + 1,
        title,
        duration: parseInt(duration),
        startTime: new Date(),
        active: true
    };
    competitions.push(newCompetition);
    io.emit('newCompetition', newCompetition);
    res.json(newCompetition);
});

app.post('/api/assign-rank', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const currentUser = users.find(u => 'fake-token-' + u.id === token);

    if (!currentUser || !isOwner(currentUser)) {
        return res.status(403).json({ error: 'غير مسموح - فقط المالك يمكنه تغيير الرتب' });
    }

    const { userId, rank, reason } = req.body;
    const user = users.find(u => u.id === parseInt(userId));

    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const validRanks = ['visitor', 'bronze', 'silver', 'gold', 'diamond', 'crown', 'moderator', 'admin', 'super', 'legend', 'chat_star', 'vip'];
    if (!validRanks.includes(rank)) {
        return res.status(400).json({ error: 'رتبة غير صالحة' });
    }

    user.rank = rank;
    if (rank === 'admin' || rank === 'moderator') {
        user.role = 'admin';
    }

    if (reason) {
        user.rankChangeReason = reason;
        user.rankChangedAt = new Date().toISOString();
        user.rankChangedBy = currentUser.email;
    }

    res.json({ 
        message: 'تم تغيير الرتبة بنجاح',
        user: {
            id: user.id,
            display_name: user.display_name,
            rank: user.rank
        }
    });

    io.emit('userUpdated', user);
});

app.post('/api/remove-rank', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const currentUser = users.find(u => 'fake-token-' + u.id === token);

    if (!currentUser || !isOwner(currentUser)) {
        return res.status(403).json({ error: 'غير مسموح - فقط المالك يمكنه إزالة الرتب' });
    }

    const { userId } = req.body;
    const user = users.find(u => u.id === parseInt(userId));

    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    user.rank = 'visitor';
    user.role = 'user';
    delete user.rankChangeReason;
    delete user.rankChangedAt;
    delete user.rankChangedBy;

    res.json({ 
        message: 'تم إزالة الرتبة بنجاح',
        user: {
            id: user.id,
            display_name: user.display_name,
            rank: user.rank
        }
    });

    io.emit('userUpdated', user);
});

app.get('/api/users', (req, res) => {
    res.json(users.map(u => ({
        id: u.id,
        display_name: u.display_name,
        rank: u.rank,
        role: u.role,
        profile_image1: u.profile_image1,
        age: u.age,
        gender: u.gender,
        marital_status: u.marital_status,
        about_me: u.about_me,
        isOnline: onlineUsers.has(u.id)
    })));
});

app.post('/api/ban', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    if (!admin || (!isOwner(admin) && admin.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const { userId, reason, duration } = req.body;
    const user = users.find(u => u.id === parseInt(userId));
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const ban = {
        id: bans.length + 1,
        user_id: user.id,
        reason,
        duration,
        timestamp: new Date()
    };
    bans.push(ban);
    io.emit('userBanned', { userId: user.id, reason, duration });
    res.json({ message: 'تم طرد المستخدم' });
});

app.post('/api/mute', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);
    if (!admin || (!isOwner(admin) && admin.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const { userId, reason, duration } = req.body;
    const user = users.find(u => u.id === parseInt(userId));
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const mute = {
        id: mutes.length + 1,
        user_id: user.id,
        reason,
        duration,
        timestamp: new Date()
    };
    mutes.push(mute);
    io.emit('userMuted', { userId: user.id, reason, duration });
    res.json({ message: 'تم كتم المستخدم' });
});

app.delete('/api/rooms/:roomId/messages', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);

    if (!user || (!isOwner(user) && user.role !== 'admin')) {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const roomId = parseInt(req.params.roomId);
    messages = messages.filter(m => m.roomId !== roomId);
    io.to(roomId.toString()).emit('messagesCleared');
    res.json({ message: 'تم مسح جميع الرسائل في الغرفة' });
});

app.put('/api/user/profile/:userId', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const admin = users.find(u => 'fake-token-' + u.id === token);

    if (!isOwner(admin)) {
        return res.status(403).json({ error: 'فقط المالك يمكنه تعديل بروفايلات الآخرين' });
    }

    const targetUser = users.find(u => u.id === parseInt(req.params.userId));
    if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود' });

    Object.assign(targetUser, req.body);
    res.json(targetUser);
});

app.get('/api/user/profile/:userId', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.userId));
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const token = req.headers.authorization?.split(' ')[1];
    const viewer = users.find(u => 'fake-token-' + u.id === token);

    if (isOwner(viewer)) {
        return res.json(user);
    }

    res.json({
        id: user.id,
        display_name: user.display_name,
        age: user.age,
        gender: user.gender,
        country: user.country,
        about_me: user.about_me,
        profile_image1: user.profile_image1,
        rank: user.rank,
        isOnline: onlineUsers.has(user.id)
    });
});

app.post('/api/change-password', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const requester = users.find(u => 'fake-token-' + u.id === token);

    if (!requester) {
        return res.status(401).json({ error: 'غير مصرح له' });
    }

    const { targetUserId, currentPassword, newPassword } = req.body;

    const targetUser = users.find(u => u.id === parseInt(targetUserId));
    if (!targetUser) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const isOwnerCheck = isOwner(requester);

    if (!isOwnerCheck && requester.id !== targetUser.id) {
        return res.status(403).json({ error: 'لا يمكنك تغيير كلمة مرور مستخدم آخر' });
    }

    if (!isOwnerCheck) {
        if (requester.password !== currentPassword) {
            return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }
    }

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    targetUser.password = newPassword;

    if (isOwnerCheck && requester.id !== targetUser.id) {
        io.emit('userPasswordChanged', { userId: targetUser.id });
    }

    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
});

app.post('/api/change-email', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const requester = users.find(u => 'fake-token-' + u.id === token);

    if (!requester) {
        return res.status(401).json({ error: 'غير مصرح له' });
    }

    const { userId, newEmail } = req.body;

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }

    const targetUser = users.find(u => u.id === parseInt(userId));
    if (!targetUser) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const isOwnerCheck = isOwner(requester);

    if (!isOwnerCheck && requester.id !== targetUser.id) {
        return res.status(403).json({ error: 'لا يمكنك تغيير بريد مستخدم آخر' });
    }

    if (users.some(u => u.email === newEmail && u.id !== targetUser.id)) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم مسبقًا' });
    }

    targetUser.email = newEmail;

    res.json({ message: 'تم تغيير البريد الإلكتروني بنجاح', email: newEmail });
});

app.post('/api/advertisements', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);

    if (!canCreateAds(user)) {
        return res.status(403).json({ error: 'هذه الميزة متاحة للمشرفين والإداريين فقط' });
    }

    const { title, content, duration } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'يجب إدخال العنوان والمحتوى' });
    }

    const newAd = {
        id: advertisements.length + 1,
        title,
        content,
        type: 'official',
        creator_id: user.id,
        creator_name: user.display_name,
        creator_rank: user.rank,
        duration: duration || 60,
        created_at: new Date(),
        active: true
    };

    advertisements.push(newAd);
    io.emit('newAdvertisement', newAd);

    res.json(newAd);
});

app.post('/api/advertisements/anonymous', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);

    if (!user) {
        return res.status(401).json({ error: 'غير مصرح له' });
    }

    const { title, content, duration } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'يجب إدخال العنوان والمحتوى' });
    }

    const newAd = {
        id: advertisements.length + 1,
        title,
        content,
        type: 'anonymous',
        creator_id: user.id,
        creator_name: 'مجهول',
        creator_rank: null,
        duration: duration || 30,
        created_at: new Date(),
        active: true
    };

    advertisements.push(newAd);
    io.emit('newAdvertisement', {
        ...newAd,
        creator_id: null
    });

    res.json({ message: 'تم نشر الإعلان بنجاح' });
});

app.get('/api/advertisements', (req, res) => {
    const activeAds = advertisements.filter(ad => ad.active);
    res.json(activeAds);
});

app.delete('/api/advertisements/:id', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const user = users.find(u => 'fake-token-' + u.id === token);

    if (!canCreateAds(user)) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    const adId = parseInt(req.params.id);
    const adIndex = advertisements.findIndex(ad => ad.id === adId);

    if (adIndex === -1) {
        return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    advertisements.splice(adIndex, 1);
    io.emit('advertisementDeleted', adId);

    res.json({ message: 'تم حذف الإعلان' });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    }
    res.json({ url: `/Uploads/${req.file.filename}` });
});

function parseDuration(duration) {
    const map = {
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        'permanent': Infinity
    };
    return map[duration] || 0;
}

function findSocketByUserId(userId) {
    const sockets = Array.from(io.sockets.sockets.values());
    return sockets.find(s => s.user && s.user.userId === userId);
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'الآن';
    if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `منذ ${Math.floor(seconds / 3600)} ساعة`;
    return `منذ ${Math.floor(seconds / 86400)} يوم`;
}

function makeAIMove(game, gameId) {
    const emptyIndices = game.board
        .map((val, idx) => val === null ? idx : null)
        .filter(val => val !== null);

    if (emptyIndices.length === 0) return;

    const randomIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    game.board[randomIndex] = 'O';

    const winner = checkWinner(game.board);
    if (winner) {
        game.winner = winner;
        game.status = 'finished';
        io.to(gameId).emit('gameOver', {
            winner: winner === 'draw' ? 'draw' : game.player2,
            board: game.board
        });
    } else {
        game.currentTurn = 'X';
        io.to(gameId).emit('boardUpdated', {
            board: game.board,
            currentTurn: game.currentTurn
        });
    }
}

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }

    if (board.every(cell => cell !== null)) {
        return 'draw';
    }

    return null;
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, messages] of floodProtection.entries()) {
        const recentMessages = messages.filter(time => now - time < 60000);
        if (recentMessages.length === 0) {
            floodProtection.delete(userId);
        } else {
            floodProtection.set(userId, recentMessages);
        }
    }
}, 60000);

setInterval(() => {
    const now = new Date();
    mutes = mutes.filter(mute => {
        if (mute.endTime && now > new Date(mute.endTime)) {
            return false;
        }
        return true;
    });
    
    roomKicks = roomKicks.filter(kick => {
        if (kick.expiresAt && now > new Date(kick.expiresAt)) {
            return false;
        }
        return true;
    });
}, 30000);

io.on('connection', (socket) => {
    console.log('مستخدم متصل: ' + socket.id);

    socket.on('join', (data) => {
        const kick = roomKicks.find(k => k.userId === data.userId && k.roomId === data.roomId && new Date() < new Date(k.expiresAt));
        let targetRoom = data.roomId;
        
        if (kick) {
            socket.emit('kickedFromRoom', { 
                roomId: data.roomId, 
                reason: kick.reason || 'أنت مطرود من هذه الغرفة'
            });
            targetRoom = 1;
        }
        
        socket.join(targetRoom.toString());
        socket.user = data;
        socket.currentRoom = targetRoom;
        
        const userInfo = {
            socketId: socket.id,
            userId: data.userId,
            display_name: data.display_name,
            rank: data.rank,
            profile_image1: data.profile_image1,
            currentRoom: targetRoom
        };
        onlineUsers.set(data.userId, userInfo);
        
        io.emit('userList', users.filter(u => u.id !== socket.user.userId));
        io.emit('onlineUsersUpdated', Array.from(onlineUsers.values()));
    });

    socket.on('changeRoom', (newRoomId) => {
        const kick = roomKicks.find(k => k.userId === socket.user?.userId && k.roomId === newRoomId && new Date() < new Date(k.expiresAt));
        if (kick) {
            socket.emit('kickedFromRoom', { 
                roomId: newRoomId, 
                reason: kick.reason || 'أنت مطرود من هذه الغرفة'
            });
            return;
        }
        
        if (socket.currentRoom) {
            socket.leave(socket.currentRoom.toString());
        }

        socket.join(newRoomId.toString());
        socket.currentRoom = newRoomId;
        
        if (socket.user) {
            const userInfo = onlineUsers.get(socket.user.userId);
            if (userInfo) {
                userInfo.currentRoom = newRoomId;
                onlineUsers.set(socket.user.userId, userInfo);
            }
        }

        io.emit('onlineUsersUpdated', Array.from(onlineUsers.values()));
        console.log(`المستخدم ${socket.user?.display_name} انتقل إلى الغرفة ${newRoomId}`);
    });

    socket.on('sendMessage', (data) => {
        if (!socket.user) return;
        
        const userId = socket.user.userId;
        const now = Date.now();

        if (!floodProtection.has(userId)) {
            floodProtection.set(userId, []);
        }

        const userMessages = floodProtection.get(userId);
        const recentMessages = userMessages.filter(time => now - time < 10000);

        if (recentMessages.length >= 5) {
            const muteEndTime = new Date(now + 5 * 60 * 1000);
            const mute = {
                id: mutes.length + 1,
                user_id: userId,
                reason: 'الفيضانات - رسائل سريعة ومتكررة',
                duration: '5m',
                timestamp: new Date(),
                endTime: muteEndTime
            };
            mutes.push(mute);

            const muteMessage = {
                id: messages.length + 1,
                roomId: data.roomId,
                content: `تم كتم ${socket.user.display_name} بسبب الفيضانات`,
                type: 'system',
                timestamp: new Date()
            };
            messages.push(muteMessage);
            io.to(data.roomId.toString()).emit('newMessage', muteMessage);

            socket.emit('error', 'تم كتمك لمدة 5 دقائق بسبب الرسائل السريعة والمتكررة');
            return;
        }

        recentMessages.push(now);
        floodProtection.set(userId, recentMessages);

        const isMuted = mutes.find(m => m.user_id === socket.user.userId && 
            (m.duration === 'permanent' || (m.endTime && new Date() < new Date(m.endTime)) || 
             new Date() - new Date(m.timestamp) < parseDuration(m.duration)));
        if (isMuted) return socket.emit('error', 'أنت مكتوم ولا يمكنك إرسال الرسائل');

        const message = { 
            id: messages.length + 1, 
            roomId: data.roomId, 
            user_id: socket.user.userId, 
            display_name: socket.user.display_name, 
            rank: socket.user.rank,
            profile_image1: socket.user.profile_image1,
            content: data.content, 
            type: data.type || 'text',
            image_url: data.image_url,
            voice_url: data.voice_url,
            quotedMessage: data.quotedMessage,
            timestamp: new Date() 
        };
        messages.push(message);
        io.to(data.roomId.toString()).emit('newMessage', message);
    });

    socket.on('sendPrivateMessage', (data) => {
        if (!socket.user) return;
        
        const isMuted = mutes.find(m => m.user_id === socket.user.userId && 
            (m.duration === 'permanent' || new Date() - new Date(m.timestamp) < parseDuration(m.duration)));
        if (isMuted) return socket.emit('error', 'أنت مكتوم ولا يمكنك إرسال الرسائل');

        const message = { 
            id: privateMessages.length + 1, 
            senderId: socket.user.userId,
            senderName: socket.user.display_name,
            senderRank: socket.user.rank,
            senderImage: socket.user.profile_image1,
            receiverId: data.receiverId, 
            content: data.content, 
            type: data.type || 'text',
            image_url: data.image_url,
            voice_url: data.voice_url,
            read: false,
            timestamp: new Date() 
        };
        privateMessages.push(message);

        const receiverSocket = findSocketByUserId(data.receiverId);
        if (receiverSocket) {
            receiverSocket.emit('newPrivateMessage', message);
        }

        socket.emit('newPrivateMessage', message);
    });

    socket.on('markPrivateMessagesRead', (data) => {
        if (!socket.user) return;
        
        privateMessages.forEach(pm => {
            if (pm.senderId === data.senderId && pm.receiverId === socket.user.userId) {
                pm.read = true;
            }
        });
    });

    socket.on('getOnlineUsers', () => {
        socket.emit('onlineUsersUpdated', Array.from(onlineUsers.values()));
    });

    socket.on('getRooms', () => {
        socket.emit('roomsUpdated', rooms);
    });

    socket.on('sendImage', (data, callback) => {
        if (!socket.user) return callback?.({ error: 'غير مصرح' });
        
        const isMuted = mutes.find(m => m.user_id === socket.user.userId && 
            (m.duration === 'permanent' || new Date() - new Date(m.timestamp) < parseDuration(m.duration)));
        if (isMuted) return callback?.({ error: 'أنت مكتوم ولا يمكنك إرسال الصور' });

        const message = { 
            id: messages.length + 1, 
            image_url: data.image_url, 
            type: 'image', 
            roomId: data.roomId, 
            user_id: socket.user.userId, 
            display_name: socket.user.display_name, 
            rank: socket.user.rank,
            profile_image1: socket.user.profile_image1,
            timestamp: new Date() 
        };
        messages.push(message);
        io.to(data.roomId.toString()).emit('newMessage', message);
        callback?.({ success: true });
    });

    socket.on('sendVoice', (data, callback) => {
        if (!socket.user) return callback?.({ error: 'غير مصرح' });
        
        const isMuted = mutes.find(m => m.user_id === socket.user.userId && 
            (m.duration === 'permanent' || new Date() - new Date(m.timestamp) < parseDuration(m.duration)));
        if (isMuted) return callback?.({ error: 'أنت مكتوم ولا يمكنك إرسال الرسائل الصوتية' });

        const message = { 
            id: messages.length + 1, 
            voice_url: data.voice_url, 
            type: 'voice', 
            roomId: data.roomId, 
            user_id: socket.user.userId, 
            display_name: socket.user.display_name, 
            rank: socket.user.rank,
            profile_image1: socket.user.profile_image1,
            timestamp: new Date() 
        };
        messages.push(message);
        io.to(data.roomId.toString()).emit('newMessage', message);
        callback?.({ success: true });
    });

    socket.on('sendPrivateImage', (data, callback) => {
        if (!socket.user) return callback?.({ error: 'غير مصرح' });
        
        const message = { 
            id: privateMessages.length + 1, 
            senderId: socket.user.userId,
            senderName: socket.user.display_name,
            senderRank: socket.user.rank,
            senderImage: socket.user.profile_image1,
            receiverId: data.receiverId,
            image_url: data.image_url, 
            type: 'image',
            read: false,
            timestamp: new Date() 
        };
        privateMessages.push(message);
        
        const receiverSocket = findSocketByUserId(data.receiverId);
        if (receiverSocket) {
            receiverSocket.emit('newPrivateMessage', message);
        }
        socket.emit('newPrivateMessage', message);
        callback?.({ success: true });
    });

    socket.on('sendPrivateVoice', (data, callback) => {
        if (!socket.user) return callback?.({ error: 'غير مصرح' });
        
        const message = { 
            id: privateMessages.length + 1, 
            senderId: socket.user.userId,
            senderName: socket.user.display_name,
            senderRank: socket.user.rank,
            senderImage: socket.user.profile_image1,
            receiverId: data.receiverId,
            voice_url: data.voice_url, 
            type: 'voice',
            read: false,
            timestamp: new Date() 
        };
        privateMessages.push(message);
        
        const receiverSocket = findSocketByUserId(data.receiverId);
        if (receiverSocket) {
            receiverSocket.emit('newPrivateMessage', message);
        }
        socket.emit('newPrivateMessage', message);
        callback?.({ success: true });
    });

    socket.on('deleteRoom', (roomId) => {
        if (!socket.user) return;
        const user = users.find(u => u.id === socket.user.userId);
        if (user && (isOwner(user) || user.role === 'admin')) {
            if (roomId === 1) {
                socket.emit('error', 'لا يمكن حذف الغرفة الرئيسية');
                return;
            }
            rooms = rooms.filter(r => r.id !== roomId);
            io.emit('roomDeleted', roomId);
            io.emit('roomsUpdated', rooms);
        }
    });

    socket.on('sendNotification', (data) => {
        io.to(data.userId).emit('newNotification', data);
    });

    socket.on('loadNewsPosts', () => {
        socket.emit('loadNewsPosts', news);
    });

    socket.on('addNewsPost', (data) => {
        const user = socket.user;
        if (!user) return;
        const isMuted = mutes.find(m => m.user_id === user.userId && 
            (m.duration === 'permanent' || new Date() - new Date(m.timestamp) < parseDuration(m.duration)));
        if (isMuted) return socket.emit('error', 'أنت مكتوم ولا يمكنك نشر الأخبار');

        const newNews = {
            id: news.length + 1,
            content: data.content,
            media: data.media,
            user_id: user.userId,
            display_name: user.display_name,
            timestamp: new Date(),
            likes: []
        };
        news.push(newNews);
        io.emit('updateNewsPost', newNews);
    });

    socket.on('addReaction', (data) => {
        const user = socket.user;
        if (!user) return;
        const post = news.find(n => n.id === parseInt(data.postId));
        if (post) {
            if (!post.reactions) post.reactions = { likes: [], dislikes: [], hearts: [] };

            Object.keys(post.reactions).forEach(reactionType => {
                post.reactions[reactionType] = post.reactions[reactionType].filter(r => r.user_id !== user.userId);
            });

            if (data.type === 'like') {
                post.reactions.likes.push({ user_id: user.userId, display_name: user.display_name });
            } else if (data.type === 'dislike') {
                post.reactions.dislikes.push({ user_id: user.userId, display_name: user.display_name });
            } else if (data.type === 'heart') {
                post.reactions.hearts.push({ user_id: user.userId, display_name: user.display_name });
            }

            io.emit('updateNewsPost', post);
        }
    });

    socket.on('addComment', (data) => {
        const user = socket.user;
        if (!user) return;

        const newComment = {
            id: comments.length + 1,
            postId: parseInt(data.postId),
            content: data.content,
            user_id: user.userId,
            display_name: user.display_name,
            targetUserId: data.targetUserId ? parseInt(data.targetUserId) : null,
            timestamp: new Date()
        };
        comments.push(newComment);

        io.emit('newComment', newComment);

        if (data.targetUserId) {
            io.to(data.targetUserId).emit('commentNotification', {
                from: user.display_name,
                content: data.content,
                postId: data.postId
            });
        }
    });

    socket.on('stopCompetition', (competitionId) => {
        const competition = competitions.find(c => c.id === parseInt(competitionId));
        if (competition) {
            competition.active = false;
            io.emit('competitionStopped', competitionId);
        }
    });

    socket.on('createXOGame', (data) => {
        const gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const game = {
            id: gameId,
            mode: data.mode,
            player1: {
                id: socket.id,
                odId: data.userId,
                name: data.playerName,
                symbol: 'X'
            },
            player2: null,
            board: Array(9).fill(null),
            currentTurn: 'X',
            winner: null,
            status: 'waiting',
            createdAt: new Date()
        };

        xoGames[gameId] = game;
        socket.join(gameId);

        socket.emit('gameCreated', {
            gameId,
            shareUrl: `${data.baseUrl || 'http://localhost:5000'}/xo.html?game=${gameId}`,
            game
        });

        console.log(`تم إنشاء لعبة XO: ${gameId}`);
    });

    socket.on('joinXOGame', (data) => {
        const game = xoGames[data.gameId];

        if (!game) {
            return socket.emit('gameError', { message: 'اللعبة غير موجودة' });
        }

        if (game.mode === 'ai') {
            return socket.emit('gameError', { message: 'هذه لعبة ضد الكمبيوتر - لا يمكن الانضمام' });
        }

        if (game.player2) {
            return socket.emit('gameError', { message: 'اللعبة ممتلئة' });
        }

        game.player2 = {
            id: socket.id,
            userId: data.userId,
            name: data.playerName,
            symbol: 'O'
        };
        game.status = 'playing';

        socket.join(data.gameId);

        io.to(data.gameId).emit('gameStarted', game);

        console.log(`انضم ${data.playerName} للعبة ${data.gameId}`);
    });

    socket.on('makeXOMove', (data) => {
        const game = xoGames[data.gameId];

        if (!game) {
            return socket.emit('gameError', { message: 'اللعبة غير موجودة' });
        }

        if (game.status !== 'playing') {
            return socket.emit('gameError', { message: 'اللعبة لم تبدأ بعد' });
        }

        const isPlayer1 = socket.id === game.player1.id;
        const isPlayer2 = game.player2 && socket.id === game.player2.id;
        const playerSymbol = isPlayer1 ? 'X' : 'O';

        if (game.currentTurn !== playerSymbol) {
            return socket.emit('gameError', { message: 'ليس دورك!' });
        }

        if (game.board[data.index] !== null) {
            return socket.emit('gameError', { message: 'الخانة محجوزة!' });
        }

        game.board[data.index] = playerSymbol;

        const winner = checkWinner(game.board);
        if (winner) {
            game.winner = winner;
            game.status = 'finished';
            io.to(data.gameId).emit('gameOver', {
                winner: winner === 'draw' ? 'draw' : (winner === 'X' ? game.player1 : game.player2),
                board: game.board
            });
        } else {
            game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

            io.to(data.gameId).emit('boardUpdated', {
                board: game.board,
                currentTurn: game.currentTurn
            });

            if (game.mode === 'ai' && game.currentTurn === 'O') {
                setTimeout(() => {
                    makeAIMove(game, data.gameId);
                }, 500);
            }
        }
    });

    socket.on('restartXOGame', (data) => {
        const game = xoGames[data.gameId];
        if (!game) return;

        game.board = Array(9).fill(null);
        game.currentTurn = 'X';
        game.winner = null;
        game.status = 'playing';

        io.to(data.gameId).emit('gameRestarted', game);
    });

    socket.on('leaveXOGame', (data) => {
        const game = xoGames[data.gameId];
        if (!game) return;

        socket.leave(data.gameId);
        io.to(data.gameId).emit('playerLeft', {
            message: 'اللاعب غادر اللعبة'
        });

        setTimeout(() => {
            delete xoGames[data.gameId];
        }, 5 * 60 * 1000);
    });

    socket.on('createAdvertisement', (data) => {
        const user = users.find(u => u.id === socket.user?.userId);

        if (!canCreateAds(user)) {
            return socket.emit('adError', { message: 'هذه الميزة متاحة للمشرفين والإداريين فقط' });
        }

        const newAd = {
            id: advertisements.length + 1,
            title: data.title,
            content: data.content,
            type: 'official',
            creator_id: user.id,
            creator_name: user.display_name,
            creator_rank: user.rank,
            duration: data.duration || 60,
            created_at: new Date(),
            active: true
        };

        advertisements.push(newAd);
        io.emit('newAdvertisement', newAd);
    });

    socket.on('createAnonymousAd', (data) => {
        const user = users.find(u => u.id === socket.user?.userId);

        if (!user) return;

        const newAd = {
            id: advertisements.length + 1,
            title: data.title,
            content: data.content,
            type: 'anonymous',
            creator_id: user.id,
            creator_name: 'مجهول',
            creator_rank: null,
            duration: data.duration || 30,
            created_at: new Date(),
            active: true
        };

        advertisements.push(newAd);
        io.emit('newAdvertisement', {
            ...newAd,
            creator_id: null
        });
    });

    socket.on('sendFriendRequest', (data) => {
        if (!socket.user) return;
        
        const targetUser = users.find(u => u.id === data.targetUserId);
        if (!targetUser) {
            return socket.emit('friendRequestError', { message: 'المستخدم غير موجود' });
        }
        
        if (!friendRequests[data.targetUserId]) {
            friendRequests[data.targetUserId] = [];
        }
        
        if (friendRequests[data.targetUserId].some(r => r.userId === socket.user.userId)) {
            return socket.emit('friendRequestError', { message: 'تم إرسال طلب صداقة مسبقاً' });
        }
        
        friendRequests[data.targetUserId].push({
            odId: socket.user.odId,
            userName: socket.user.display_name,
            userAvatar: socket.user.profile_image1,
            timestamp: new Date()
        });
        
        const targetSocket = findSocketByUserId(data.targetUserId);
        if (targetSocket) {
            targetSocket.emit('newFriendRequest', {
                userId: socket.user.userId,
                userName: socket.user.display_name,
                userAvatar: socket.user.profile_image1
            });
        }
        
        socket.emit('friendRequestSent', { message: 'تم إرسال طلب الصداقة' });
    });

    socket.on('acceptFriendRequest', (data) => {
        if (!socket.user) return;
        
        if (!friendsList[socket.user.userId]) {
            friendsList[socket.user.userId] = [];
        }
        if (!friendsList[data.userId]) {
            friendsList[data.userId] = [];
        }
        
        friendsList[socket.user.userId].push(data.userId);
        friendsList[data.userId].push(socket.user.userId);
        
        if (friendRequests[socket.user.userId]) {
            friendRequests[socket.user.userId] = friendRequests[socket.user.userId].filter(r => r.userId !== data.userId);
        }
        
        const targetSocket = findSocketByUserId(data.userId);
        if (targetSocket) {
            targetSocket.emit('friendRequestAccepted', {
                odId: socket.user.odId,
                userName: socket.user.display_name
            });
        }
        
        socket.emit('friendRequestAccepted', { userId: data.userId });
    });

    socket.on('rejectFriendRequest', (data) => {
        if (!socket.user) return;
        
        if (friendRequests[socket.user.userId]) {
            friendRequests[socket.user.userId] = friendRequests[socket.user.userId].filter(r => r.userId !== data.userId);
        }
        
        socket.emit('friendRequestRejected', { userId: data.userId });
    });

    socket.on('disconnect', () => {
        console.log('مستخدم منفصل: ' + socket.id);
        if (socket.user) {
            onlineUsers.delete(socket.user.userId);
            io.emit('onlineUsersUpdated', Array.from(onlineUsers.values()));
        }
        io.emit('userList', users.filter(u => u.id !== socket.user?.userId));
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
