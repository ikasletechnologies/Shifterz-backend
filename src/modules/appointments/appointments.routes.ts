import { Router } from 'express';
import { AppointmentsController } from './appointments.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { createAppointmentSchema, updateAppointmentSchema } from './appointments.validation.js';

export const appointmentRouter = Router();
const controller = new AppointmentsController();

appointmentRouter.use(authenticate);

appointmentRouter.get('/', controller.getAppointments);
appointmentRouter.post('/', validate(createAppointmentSchema), controller.createAppointment);
appointmentRouter.get('/:id', controller.getAppointmentById);
appointmentRouter.put('/:id', validate(updateAppointmentSchema), controller.updateAppointment);
appointmentRouter.delete('/:id', controller.deleteAppointment);
