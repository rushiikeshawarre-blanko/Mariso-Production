import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { addAddress, deleteAddress } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { getCitiesForState, INDIA_STATES, withStoredOption } from '../../lib/indiaLocations';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const AddressesPage = () => {
  const { user, isAuthenticated, loginWithRedirect } = useAuth0();
  const [addresses, setAddresses] = useState(user?.addresses || []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    address_line_2: '',
    city: '',
    state: '',
    country: 'India',
    postal_code: '',
    is_default: false
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStateChange = (e) => {
    const state = e.target.value;
    setFormData((currentData) => ({
      ...currentData,
      state,
      city: getCitiesForState(state).includes(currentData.city) ? currentData.city : ''
    }));
  };

  const stateOptions = withStoredOption(INDIA_STATES, formData.state);
  const cityOptions = withStoredOption(getCitiesForState(formData.state), formData.city);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.address || !formData.city || !formData.state || !formData.country || !formData.postal_code) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const newAddress = await addAddress(formData);
      setAddresses([...addresses, newAddress]);
      setDialogOpen(false);
      setFormData({
        name: '',
        phone: '',
        address: '',
        address_line_2: '',
        city: '',
        state: '',
        country: 'India',
        postal_code: '',
        is_default: false
      });
      toast.success('Address added successfully');
    } catch (error) {
      toast.error('Failed to add address');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (addressId) => {
    try {
      await deleteAddress(addressId);
      setAddresses(addresses.filter(addr => addr.id !== addressId));
      toast.success('Address deleted');
    } catch (error) {
      toast.error('Failed to delete address');
    }
  };

  return (
    <div data-testid="addresses-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-2xl">Saved Addresses</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-address-button">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              Add Address
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Add New Address</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Address Label</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Home, Office, etc."
                  className="mt-1"
                  data-testid="address-name"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="mt-1"
                  data-testid="address-phone"
                />
              </div>
              <div>
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="123 Main Street, Apt 4B"
                  className="mt-1"
                  data-testid="address-street"
                />
              </div>
              <div>
                <Label htmlFor="address_line_2">Address Line 2 (Optional)</Label>
                <Input
                  id="address_line_2"
                  name="address_line_2"
                  value={formData.address_line_2}
                  onChange={handleChange}
                  placeholder="Apartment, suite, landmark"
                  className="mt-1"
                  data-testid="address-line-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="state">State</Label>
                  <select
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleStateChange}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    data-testid="address-state"
                  >
                    <option value="">Select state</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <select
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    required
                    disabled={!formData.state}
                    data-testid="address-city"
                  >
                    <option value="">Select city</option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    placeholder="400001"
                    className="mt-1"
                    data-testid="address-postal"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    placeholder="India"
                    className="mt-1"
                    required
                    data-testid="address-country"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                  data-testid="address-default"
                />
                <span className="text-sm">Set as default address</span>
              </label>
              <Button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
                data-testid="save-address"
              >
                {loading ? 'Saving...' : 'Save Address'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl card-shadow" data-testid="no-addresses">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" strokeWidth={1} />
          <h3 className="font-heading text-xl mb-2">No saved addresses</h3>
          <p className="text-muted-foreground">Add an address for faster checkout.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <div 
              key={address.id} 
              className="bg-white rounded-xl p-6 card-shadow relative"
              data-testid={`address-${address.id}`}
            >
              {address.is_default && (
                <span className="absolute top-4 right-4 text-xs bg-terracotta/20 text-terracotta px-2 py-1 rounded-full">
                  Default
                </span>
              )}
              <h3 className="font-medium mb-2">{address.name}</h3>
              <p className="text-muted-foreground text-sm">
                {address.address}<br />
                {address.address_line_2 && <>{address.address_line_2}<br /></>}
                {address.city}{address.state ? `, ${address.state}` : ''}, {address.postal_code}<br />
                {address.country || 'Not provided'}<br />
                {address.phone}
              </p>
              <button
                onClick={() => handleDelete(address.id)}
                className="mt-4 text-sm text-muted-foreground hover:text-destructive flex items-center gap-1"
                data-testid={`delete-address-${address.id}`}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressesPage;
