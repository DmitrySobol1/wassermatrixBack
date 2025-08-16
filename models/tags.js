import mongoose from 'mongoose';

const TagsSchema = new mongoose.Schema(
  {
    name: String, 
    description: String  
    
  },
  {
    timestamps: true 
  }
);


export default mongoose.model('Tags', TagsSchema);