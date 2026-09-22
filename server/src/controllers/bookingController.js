import Joi from 'joi';
import { Booking } from '../models/Booking.js';

const createSchema = Joi.object({
  roomNumber: Joi.string().min(1).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  purpose: Joi.string().allow('').optional(),
  bookedBy: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
}).custom((value, helpers) => {
  if (new Date(value.startDate) >= new Date(value.endDate)) {
    return helpers.message('startDate must be strictly before endDate');
  }
  return value;
});

const updateSchema = Joi.object({
  roomNumber: Joi.string().min(1),
  startDate: Joi.date(),
  endDate: Joi.date(),
  purpose: Joi.string().allow(''),
  bookedBy: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
});

function publicBooking(b) {
  return {
    id: b._id.toString(),
    roomNumber: b.roomNumber,
    startDate: b.startDate,
    endDate: b.endDate,
    purpose: b.purpose,
    bookedBy: b.bookedBy,
    createdAt: b.createdAt,
  };
}

// Finds an existing booking on the same room whose range overlaps the given one.
async function findConflict(roomNumber, startDate, endDate, excludeId) {
  const query = {
    roomNumber,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Booking.findOne(query);
}

// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const filter = req.query.roomNumber ? { roomNumber: req.query.roomNumber } : {};
    const bookings = await Booking.find(filter)
      .populate('bookedBy', 'name email')
      .sort({ startDate: 1 })
      .lean();
    res.json({ bookings: bookings.map(publicBooking) });
  } catch (err) { next(err); }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id).populate('bookedBy', 'name email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ booking: publicBooking(booking) });
  } catch (err) { next(err); }
}

// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    const conflict = await findConflict(value.roomNumber, value.startDate, value.endDate);
    if (conflict) return res.status(409).json({ message: 'Room already booked for an overlapping time range' });

    const booking = await Booking.create(value);
    res.status(201).json({ booking: publicBooking(booking) });
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Booking not found' });

    const roomNumber = value.roomNumber ?? existing.roomNumber;
    const startDate = value.startDate ?? existing.startDate;
    const endDate = value.endDate ?? existing.endDate;

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'startDate must be strictly before endDate' });
    }

    const conflict = await findConflict(roomNumber, startDate, endDate, existing._id);
    if (conflict) return res.status(409).json({ message: 'Room already booked for an overlapping time range' });

    Object.assign(existing, value);
    await existing.save();
    res.json({ booking: publicBooking(existing) });
  } catch (err) { next(err); }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    const doc = await Booking.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Booking not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}