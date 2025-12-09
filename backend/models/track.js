const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, required: true, min: 1, max: 5 }
}, { _id: false });

const TrackSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  artist: { type: String, required: true, trim: true },
  album: { type: String, trim: true, default: '' },
  genre: { type: String, trim: true, default: '' },
  duration: { type: Number, default: 0 }, // seconds
  audioUrl: { type: String, trim: true, required: true },
  coverUrl: { type: String, trim: true, default: '' },
  popularity: { type: Number, default: 0 },
  likesUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  ratings: [RatingSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

TrackSchema.methods.getAverageRating = function() {
  if (!this.ratings || this.ratings.length === 0) return 0;
  const sum = this.ratings.reduce((s, r) => s + r.value, 0);
  return +(sum / this.ratings.length).toFixed(2);
};

TrackSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Track || mongoose.model('Track', TrackSchema);
