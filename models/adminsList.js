import mongoose from 'mongoose';

const AdminsListSchema = new mongoose.Schema(
  {
    tlgid: Number,
    name: String,
   
  },
  {
    timestamps: true 
  }
);


export default mongoose.model('AdminsList', AdminsListSchema);