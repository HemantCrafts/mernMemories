/**
 * Seeds the database with demo users, posts, comments and follows.
 *
 *   npm run seed          (from the project root)
 *
 * WARNING: this wipes the User, Post and Comment collections first.
 */
import { connectDatabase, disconnectDatabase } from './config/db.js';
import User from './models/User.js';
import Post from './models/Post.js';
import Comment from './models/Comment.js';

const DEMO_PASSWORD = 'Password123!';

const USERS = [
  {
    username: 'ada',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    bio: 'First programmer. Currently obsessed with analytical engines.',
  },
  {
    username: 'linus',
    displayName: 'Linus T.',
    email: 'linus@example.com',
    bio: 'Talk is cheap. Show me the code.',
  },
  {
    username: 'grace',
    displayName: 'Grace Hopper',
    email: 'grace@example.com',
    bio: 'It is easier to ask forgiveness than permission.',
  },
  {
    username: 'margaret',
    displayName: 'Margaret Hamilton',
    email: 'margaret@example.com',
    bio: 'Software engineering, literally coined the term.',
  },
];

const POSTS = [
  { author: 'ada', content: 'Just sketched a looping construct on the analytical engine. Recursion feels inevitable. 🧮' },
  { author: 'linus', content: 'Refactored the kernel again. Fewer lines, fewer bugs. Coincidence? No.' },
  { author: 'grace', content: 'Found an actual moth in the relay today. Taped it into the logbook. First real bug. 🐛' },
  { author: 'margaret', content: 'The Apollo guidance software is holding. Prioritizing the critical path again.' },
  { author: 'ada', content: 'Note to self: a machine that computes music is a machine that computes anything.' },
  { author: 'grace', content: 'Wrote a compiler that reads English. People said it was impossible. It compiled anyway.' },
  { author: 'linus', content: 'Shipping is a feature. A perfect branch that never merges helps no one.' },
  { author: 'margaret', content: 'Reminder: the error handling matters more than the happy path. Every time.' },
];

const COMMENTS = [
  { post: 0, author: 'grace', content: 'This is going to change everything.' },
  { post: 0, author: 'margaret', content: 'Please document it this time.' },
  { post: 2, author: 'linus', content: 'Finally, a bug report I can believe in.' },
  { post: 4, author: 'margaret', content: 'Ada, you are three decades early. Again.' },
  { post: 5, author: 'ada', content: 'Compilers are just very literal translators.' },
];

const FOLLOWS = [
  ['linus', 'ada'],
  ['grace', 'ada'],
  ['margaret', 'ada'],
  ['ada', 'grace'],
  ['linus', 'grace'],
  ['margaret', 'linus'],
  ['grace', 'margaret'],
];

async function seed() {
  await connectDatabase();

  console.log('[seed] Clearing existing collections...');
  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
  ]);

  console.log('[seed] Creating users (password for all: %s)', DEMO_PASSWORD);
  const users = {};
  for (const data of USERS) {
    // create() (not insertMany) so the pre-save password hook runs.
    users[data.username] = await User.create({ ...data, password: DEMO_PASSWORD });
  }

  console.log('[seed] Creating posts...');
  const posts = [];
  for (const data of POSTS) {
    posts.push(
      await Post.create({
        author: users[data.author]._id,
        content: data.content,
        createdAt: new Date(Date.now() - (POSTS.length - posts.length) * 3600_000),
      })
    );
  }

  console.log('[seed] Adding comments...');
  for (const data of COMMENTS) {
    const post = posts[data.post];
    await Comment.create({
      post: post._id,
      author: users[data.author]._id,
      content: data.content,
    });
    post.commentCount += 1;
    await post.save();
  }

  console.log('[seed] Wiring follows...');
  for (const [followerName, followeeName] of FOLLOWS) {
    const follower = users[followerName];
    const followee = users[followeeName];
    follower.following.push(followee._id);
    followee.followers.push(follower._id);
  }
  await Promise.all(Object.values(users).map((u) => u.save()));

  // Scatter some likes so the UI has non-zero counts.
  console.log('[seed] Adding likes...');
  const likeMap = [
    [posts[0], ['grace', 'margaret', 'linus']],
    [posts[2], ['ada', 'linus']],
    [posts[4], ['grace', 'linus', 'margaret']],
    [posts[5], ['ada', 'margaret']],
  ];
  for (const [post, likers] of likeMap) {
    post.likes.push(...likers.map((name) => users[name]._id));
    await post.save();
  }

  console.log('\n[seed] Done.');
  console.log('[seed] Demo accounts (all use password: %s)', DEMO_PASSWORD);
  for (const data of USERS) {
    console.log(`         ${data.username.padEnd(10)} ${data.email}`);
  }
  console.log('');

  await disconnectDatabase();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error('[seed] Failed:', error.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
