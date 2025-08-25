import mongoose from 'mongoose';

const AdminPasswordSchema = new mongoose.Schema(
  {
    login: String,
    password: String,
   
  },
  {
    timestamps: true 
  }
);


export default mongoose.model('AdminPassword', AdminPasswordSchema);