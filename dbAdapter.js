import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Check if credentials are set and not placeholder
const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('placeholder') && 
  !supabaseKey.includes('placeholder');

let supabase = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔌 Connected to Supabase Cloud Database');
  } catch (err) {
    console.error('❌ Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Supabase not configured or using placeholders. Falling back to IN-MEMORY Mock Database.');
}

// Helper to generate RFC-compliant UUIDs for mock data
const generateMockUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// In-Memory Database State (Fallback)
const inMemoryDb = {
  users: [
    {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      rfid: '12345678',
      name: 'Admin Supervisor',
      email: 'admin@velodya.ev',
      role: 'admin',
      is_enabled: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      rfid: '87654321',
      name: 'John Doe',
      email: 'john.doe@example.com',
      role: 'user',
      is_enabled: true,
      created_at: new Date().toISOString()
    }
  ],
  charging_spots: [
    { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', spot_number: 1, status: 'available', created_at: new Date().toISOString() },
    { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', spot_number: 2, status: 'available', created_at: new Date().toISOString() },
    { id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', spot_number: 3, status: 'available', created_at: new Date().toISOString() }
  ],
  reservations: []
};

// Seed a past and upcoming reservation for testing
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const nextHourStart = new Date(tomorrow);
nextHourStart.setHours(10, 0, 0, 0);
const nextHourEnd = new Date(tomorrow);
nextHourEnd.setHours(12, 0, 0, 0);

inMemoryDb.reservations.push({
  id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
  user_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  charging_spot_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  start_time: nextHourStart.toISOString(),
  end_time: nextHourEnd.toISOString(),
  status: 'confirmed',
  created_at: new Date().toISOString()
});

// Adapter Database Methods
export const db = {
  // --- USERS ---
  async getUserByRfid(rfid) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('rfid', rfid)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.users.find(u => u.rfid === rfid) || null;
    }
  },

  async getUserByRfidAndEmail(rfid, email) {
    const cleanEmail = email.toLowerCase().trim();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('rfid', rfid)
        .eq('email', cleanEmail)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.users.find(u => u.rfid === rfid && u.email.toLowerCase().trim() === cleanEmail) || null;
    }
  },

  async getUserById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.users.find(u => u.id === id) || null;
    }
  },

  async createUser({ rfid, name, email, role = 'user' }) {
    const cleanEmail = email.toLowerCase().trim();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .insert([{ rfid, name, email: cleanEmail, role, is_enabled: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const newUser = {
        id: generateMockUUID(),
        rfid,
        name,
        email: cleanEmail,
        role,
        is_enabled: true,
        created_at: new Date().toISOString()
      };
      inMemoryDb.users.push(newUser);
      return newUser;
    }
  },

  async getAllUsers() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } else {
      return [...inMemoryDb.users];
    }
  },

  async updateUserStatus(id, is_enabled) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .update({ is_enabled })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const user = inMemoryDb.users.find(u => u.id === id);
      if (!user) throw new Error('User not found');
      user.is_enabled = is_enabled;
      return user;
    }
  },

  // --- CHARGING SPOTS ---
  async getAllSpots() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('charging_spots')
        .select('*')
        .order('spot_number', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      return [...inMemoryDb.charging_spots];
    }
  },

  async updateSpotStatus(id, status) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('charging_spots')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const spot = inMemoryDb.charging_spots.find(s => s.id === id);
      if (!spot) throw new Error('Spot not found');
      spot.status = status;
      return spot;
    }
  },

  // --- RESERVATIONS ---
  async getAllReservations() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          users:user_id (id, name, email, rfid),
          charging_spots:charging_spot_id (id, spot_number)
        `)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.reservations.map(res => {
        const user = inMemoryDb.users.find(u => u.id === res.user_id);
        const spot = inMemoryDb.charging_spots.find(s => s.id === res.charging_spot_id);
        return {
          ...res,
          users: user ? { id: user.id, name: user.name, email: user.email, rfid: user.rfid } : null,
          charging_spots: spot ? { id: spot.id, spot_number: spot.spot_number } : null
        };
      });
    }
  },

  async getReservationById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.reservations.find(r => r.id === id) || null;
    }
  },

  async getUserReservations(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          charging_spots:charging_spot_id (id, spot_number)
        `)
        .eq('user_id', userId)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    } else {
      return inMemoryDb.reservations
        .filter(r => r.user_id === userId)
        .map(res => {
          const spot = inMemoryDb.charging_spots.find(s => s.id === res.charging_spot_id);
          return {
            ...res,
            charging_spots: spot ? { id: spot.id, spot_number: spot.spot_number } : null
          };
        });
    }
  },

  async checkOverlap(spotId, startTime, endTime, excludeResId = null) {
    const startStr = new Date(startTime).toISOString();
    const endStr = new Date(endTime).toISOString();

    if (isSupabaseConfigured) {
      // Overlap logic: start_time < endStr AND end_time > startStr
      let query = supabase
        .from('reservations')
        .select('*')
        .eq('charging_spot_id', spotId)
        .eq('status', 'confirmed')
        .lt('start_time', endStr)
        .gt('end_time', startStr);
      
      if (excludeResId) {
        query = query.neq('id', excludeResId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data.length > 0;
    } else {
      return inMemoryDb.reservations.some(res => {
        if (res.charging_spot_id !== spotId || res.status !== 'confirmed') return false;
        if (excludeResId && res.id === excludeResId) return false;
        
        const resStart = new Date(res.start_time).toISOString();
        const resEnd = new Date(res.end_time).toISOString();
        
        return resStart < endStr && resEnd > startStr;
      });
    }
  },

  async createReservation({ user_id, charging_spot_id, start_time, end_time }) {
    // Check overlap first to ensure safety
    const hasOverlap = await this.checkOverlap(charging_spot_id, start_time, end_time);
    if (hasOverlap) {
      throw new Error('Overlapping reservation detected: this spot is already booked for the selected time.');
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .insert([{ user_id, charging_spot_id, start_time, end_time, status: 'confirmed' }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const newRes = {
        id: generateMockUUID(),
        user_id,
        charging_spot_id,
        start_time: new Date(start_time).toISOString(),
        end_time: new Date(end_time).toISOString(),
        status: 'confirmed',
        created_at: new Date().toISOString()
      };
      inMemoryDb.reservations.push(newRes);
      return newRes;
    }
  },

  async updateReservation(id, { charging_spot_id, start_time, end_time, status }) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .update({ charging_spot_id, start_time, end_time, status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const res = inMemoryDb.reservations.find(r => r.id === id);
      if (!res) throw new Error('Reservation not found');
      
      if (charging_spot_id) res.charging_spot_id = charging_spot_id;
      if (start_time) res.start_time = new Date(start_time).toISOString();
      if (end_time) res.end_time = new Date(end_time).toISOString();
      if (status) res.status = status;
      
      return res;
    }
  },

  async cancelReservation(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const res = inMemoryDb.reservations.find(r => r.id === id);
      if (!res) throw new Error('Reservation not found');
      res.status = 'cancelled';
      return res;
    }
  },

  async deleteReservation(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } else {
      const idx = inMemoryDb.reservations.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('Reservation not found');
      inMemoryDb.reservations.splice(idx, 1);
      return true;
    }
  }
};
export default db;
export { isSupabaseConfigured };
