import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-recruitment';

async function fixIndex() {
  try {
    await mongoose.connect(mongoUri, { dbName: 'ai-recruitment' });
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Drop the old non-sparse candidateId index
    try {
      await usersCollection.dropIndex('candidateId_1');
      console.log('✓ Dropped old candidateId_1 index');
    } catch (err) {
      console.log('Index may not exist or already dropped:', err.message);
    }
    
    // Create new sparse unique index
    await usersCollection.createIndex(
      { candidateId: 1 },
      { unique: true, sparse: true }
    );
    console.log('✓ Created new sparse unique index on candidateId');
    
    console.log('\n✅ Index fixed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error fixing index:', err);
    process.exit(1);
  }
}

fixIndex();
