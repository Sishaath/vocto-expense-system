import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zbqkcwclcerbfhfinghq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicWtjd2NsY2VyYmZoZmluZ2hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTMzNzYsImV4cCI6MjA5MDAyOTM3Nn0.E9rss3zjGnE-r51kXuhx2r9NpBnoPxLky8o6RnAAYS4';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  getClient() {
    return this.supabase;
  }

  async signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return this.supabase.auth.signOut();
  }

  async getClaims() {
    return this.supabase
      .from('claims')
      .select('*')
      .order('created_at', { ascending: false });
  }

  async submitClaim(claim: any) {
    return this.supabase.from('claims').insert(claim);
  }

  async updateClaimStatus(id: string, status: string) {
    return this.supabase
      .from('claims')
      .update({ status })
      .eq('id', id);
  }

  async getComments(claimId: string) {
    return this.supabase
      .from('comments')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });
  }

  async addComment(claimId: string, userId: string, message: string) {
    return this.supabase.from('comments').insert({
      claim_id: claimId,
      user_id: userId,
      message
    });
  }

  async uploadFile(claimId: string, file: File) {
    const ext = file.name.split('.').pop();
    const uniqueName = `${Date.now()}.${ext}`;
    const path = `${claimId}/${uniqueName}`;
    return this.supabase.storage
      .from('claim-documents')
      .upload(path, file, { upsert: true });
  }

  getFileUrl(path: string): string {
    return this.supabase.storage
      .from('claim-documents')
      .getPublicUrl(path).data.publicUrl;
  }

  async getSignedFileUrl(path: string): Promise<string> {
    const { data } = await this.supabase.storage
      .from('claim-documents')
      .createSignedUrl(path, 60 * 60); // 1 hour
    return data?.signedUrl ?? '';
  }
}